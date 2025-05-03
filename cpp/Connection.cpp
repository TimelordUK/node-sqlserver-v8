// ReSharper disable CppInconsistentNaming
#include "platform.h"
#include <thread>
#include <chrono>
#include <functional>
#include <memory>
#include <string>
#include <vector>

#include "Connection.h"
#include "odbc_connection.h"
#include "odbc_environment.h"
#include "odbc_error.h"
#include "query_parameter.h"
#include "query_result.h"
#include "parameter_set.h"

namespace mssql
{
  // Initialize static constructor reference
  Napi::FunctionReference Connection::constructor;

  // Initialize the class and export it to the module
  Napi::Object Connection::Init(Napi::Env env, Napi::Object exports)
  {
    // Initialize ODBC environment
    if (!OdbcConnection::InitializeEnvironment())
    {
      Napi::Error::New(env, "Failed to initialize ODBC environment")
          .ThrowAsJavaScriptException();
      return exports;
    }

    // Define class
    const Napi::Function func = DefineClass(env, "Connection",
                                            {InstanceMethod("open", &Connection::Open),
                                             InstanceMethod("close", &Connection::Close),
                                             InstanceMethod("query", &Connection::Query)});

    // Create persistent reference to constructor
    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();

    // Export the class
    exports.Set("Connection", func);
    return exports;
  }

  // Constructor
  Connection::Connection(const Napi::CallbackInfo &info)
      : Napi::ObjectWrap<Connection>(info)
  {
    SQL_LOG_DEBUG("Connection ctor");
    const Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    // Create internal ODBC connection - uses the shared environment
    odbcConnection_ = OdbcConnectionFactory::CreateConnection();
  }

  // Destructor
  Connection::~Connection()
  {
    SQL_LOG_DEBUG("~Connection dtor");
    // Make sure connection is closed
    if (isConnected_)
    {
      odbcConnection_->Close();
    }
  }

  template <typename ConnectionOp, typename SuccessCallback = std::function<void()>>
  class ConnectionWorkerBase : public Napi::AsyncWorker
  {
  public:
    ConnectionWorkerBase(
        Napi::Function &callback,
        IOdbcConnection *connection,
        Connection *parent,
        ConnectionOp operation,
        SuccessCallback onSuccess = []() {})
        : AsyncWorker(callback),
          parent_(parent),
          connection_(connection),
          operation_(std::move(operation)),
          onSuccess_(std::move(onSuccess))
    {
    }

    void Execute() override
    {
      SQL_LOG_DEBUG("Executing ConnectionWorker");

      try
      {
        result_ = operation_(connection_);

        if (!result_)
        {
          const auto &errors = connection_->GetErrors();
          if (!errors.empty())
          {
            const std::string errorMessage = errors[0]->message;
            SQL_LOG_ERROR("Connection operation error: " + errorMessage);
            SetError(errorMessage);
          }
          else
          {
            SQL_LOG_ERROR("Unknown connection operation error");
            SetError("Unknown error occurred during operation");
          }
        }
        else
        {
          SQL_LOG_DEBUG("Connection worker completed successfully");
        }
      }
      catch (const std::exception &e)
      {
        SetError(e.what());
      }
      catch (...)
      {
        SetError("Unknown error occurred");
      }
    }

    void OnOK() override
    {
      const Napi::Env env = Env();
      Napi::HandleScope scope(env);

      // Call the success callback
      onSuccess_(); // This will update the connection state

      // Create a result object
      Napi::Object result = Napi::Object::New(env);
      result.Set("success", Napi::Boolean::New(env, result_));
      SQL_LOG_DEBUG("ConnectionWorkerBase::OnOK invoke cb");
      // Call the callback with null error and result
      Callback().Call({env.Null(), result});
    }

  private:
    Connection *parent_;
    IOdbcConnection *connection_;
    ConnectionOp operation_;
    bool result_ = false;
    SuccessCallback onSuccess_;
  };

  template <typename ConnectionOp, typename SuccessCallback = std::function<void()>>
  auto MakeConnectionWorker(
      Napi::Function &callback,
      IOdbcConnection *connection,
      Connection *parent,
      ConnectionOp operation,
      SuccessCallback onSuccess = []() {})
  {
    return new ConnectionWorkerBase<ConnectionOp, SuccessCallback>(
        callback, connection, parent, std::move(operation), std::move(onSuccess));
  }

  // Open connection method - supports both callback and Promise
  Napi::Value Connection::Open(const Napi::CallbackInfo &info)
  {
    SQL_LOG_DEBUG("Connection::Open");
    const Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    // Check if we already have a connection
    if (isConnected_)
    {
      Napi::Error::New(env, "Connection is already open").ThrowAsJavaScriptException();
      return env.Undefined();
    }

    // Get connection string
    if (info.Length() < 1 || !info[0].IsString())
    {
      Napi::TypeError::New(env, "Connection string expected").ThrowAsJavaScriptException();
      return env.Undefined();
    }

    const std::string connectionString = info[0].As<Napi::String>().Utf8Value();

    // Check for callback (last argument)
    Napi::Function callback;

    if (info.Length() > 1 && info[info.Length() - 1].IsFunction())
    {
      callback = info[info.Length() - 1].As<Napi::Function>();
    }
    else
    {
      // No callback provided, we'll use a Promise
      // Create a deferred Promise
      Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);
      SQL_LOG_DEBUG("Connection - use Promise");
      // Create a callback that resolves/rejects the promise
      callback = Napi::Function::New(env, [deferred](const Napi::CallbackInfo &info)
                                     {
                    const Napi::Env env = info.Env();
                    if (info[0].IsNull() || info[0].IsUndefined()) {
                        deferred.Resolve(info[1]);
                    }
                    else {
                        deferred.Reject(info[0]);
                    }
                    return env.Undefined(); });

      const auto worker = MakeConnectionWorker(
          callback,
          odbcConnection_.get(),
          this,
          [connectionString](IOdbcConnection *conn)
          {
            SQL_LOG_DEBUG("Connection::Open - invoking native open");
            return conn->Open(connectionString, 0);
          },
          [this]()
          {
            // This will be called on success in the OnOK method
            SQL_LOG_DEBUG("Connection::Open - setting connection state to open");
            this->SetConnected(true);
          });
      worker->Queue();

      // Return the promise
      return deferred.Promise();
    }
    SQL_LOG_DEBUG("Connection - use ConnectionWorker");
    auto worker = MakeConnectionWorker(
        callback,
        odbcConnection_.get(),
        this,
        [connectionString](IOdbcConnection *conn)
        {
          SQL_LOG_DEBUG("Connection::Open - invoking native open");
          return conn->Open(connectionString, 0);
        },
        [this]()
        {
          // This will be called on success in the OnOK method
          SQL_LOG_DEBUG("Connection::Open - setting connection state to open");
          this->SetConnected(true);
        });
    worker->Queue();

    return env.Undefined();
  }

  // Close connection method
  Napi::Value Connection::Close(const Napi::CallbackInfo &info)
  {
    SQL_LOG_DEBUG("Connection::Close");
    const Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    // Check if we have a connection to close
    if (!isConnected_)
    {
      Napi::Error::New(env, "Connection is not open").ThrowAsJavaScriptException();
      return env.Undefined();
    }

    // Check for callback (last argument)
    Napi::Function callback;
    if (info.Length() > 0 && info[info.Length() - 1].IsFunction())
    {
      callback = info[info.Length() - 1].As<Napi::Function>();
    }
    else
    {
      // Synchronous close is still possible without a callback
      std::string errorMessage;

      if (bool success = odbcConnection_->Close(); !success)
      {
        Napi::Error::New(env, errorMessage).ThrowAsJavaScriptException();
        return env.Undefined();
      }

      isConnected_ = false;
      return Napi::Boolean::New(env, true);
    }

    auto worker = MakeConnectionWorker(
        callback,
        odbcConnection_.get(),
        this,
        [](IOdbcConnection *conn)
        {
          SQL_LOG_DEBUG("Connection::Close - invoking native close");
          return conn->Close();
        },
        [this]()
        {
          SQL_LOG_DEBUG("Connection::Close - setting connection state to closed");
          this->SetConnected(false);
        });
    worker->Queue();

    return env.Undefined();
  }

  // Implement Query method
  Napi::Value Connection::Query(const Napi::CallbackInfo &info)
  {
    const Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    // Check if we have a connection
    if (!isConnected_)
    {
      Napi::Error::New(env, "Connection is not open").ThrowAsJavaScriptException();
      return env.Undefined();
    }

    // Get SQL query text
    if (info.Length() < 1 || !info[0].IsString())
    {
      Napi::TypeError::New(env, "SQL query text expected").ThrowAsJavaScriptException();
      return env.Undefined();
    }

    std::string sqlText = info[0].As<Napi::String>().Utf8Value();

    // Get parameters array (optional)
    Napi::Array params = Napi::Array::New(env, 0);
    if (info.Length() > 1 && info[1].IsArray())
    {
      params = info[1].As<Napi::Array>();
    }

    // Check for callback (last argument)
    Napi::Function callback;

    if (info.Length() > 1 && info[info.Length() - 1].IsFunction())
    {
      callback = info[info.Length() - 1].As<Napi::Function>();
    }
    else
    {
      // No callback provided, we'll use a Promise
      // Create a deferred Promise
      Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);

      // Create a callback that resolves/rejects the promise
      callback = Napi::Function::New(env, [deferred](const Napi::CallbackInfo &info)
                                     {
                const Napi::Env env = info.Env();
                if (info[0].IsNull() || info[0].IsUndefined()) {
                    deferred.Resolve(info[1]);
                }
                else {
                    deferred.Reject(info[0]);
                }
                return env.Undefined(); });

      // Create and queue the worker
      const auto worker = new QueryWorker(
          callback,
          odbcConnection_.get(),
          sqlText,
          params);
      worker->Queue();

      // Return the promise
      return deferred.Promise();
    }

    // If we got here, we're using a callback
    const auto worker = new QueryWorker(
        callback,
        odbcConnection_.get(),
        sqlText,
        params);
    worker->Queue();

    return env.Undefined();
  }

  QueryWorker::QueryWorker(Napi::Function &callback,
                           IOdbcConnection *connection,
                           const std::string &sqlText,
                           const Napi::Array &params)
      : Napi::AsyncWorker(callback),
        connection_(connection),
        sqlText_(sqlText)
  {

    // Convert JavaScript parameters to C++ parameters
    const uint32_t length = params.Length();

    // Or use it somewhere, perhaps in a logging statement:
    SQL_LOG_DEBUG_STREAM("Processing " << length << " parameters");
    parameters_ = std::make_shared<ParameterSet>();
    // ParameterFactory::populateParameterSet(params, parameters_);

    result_ = std::make_shared<QueryResult>();
  }

  void QueryWorker::Execute()
  {

    try
    {
      SQL_LOG_DEBUG_STREAM("Executing QueryWorker " << sqlText_);
      // This will need to be implemented in OdbcConnection
      // Here's a placeholder showing what it might look like
      if (!connection_->ExecuteQuery(sqlText_, parameters_->getParams(), result_))
      {
        const auto &errors = connection_->GetErrors();
        if (!errors.empty())
        {
          const std::string errorMessage = errors[0]->message;
          SetError(errorMessage);
        }
        else
        {
          SetError("Unknown error occurred during query execution");
        }
      }
    }
    catch (const std::exception &e)
    {
      SQL_LOG_ERROR("Exception in QueryWorker::Execute: " + std::string(e.what()));
      SetError("Exception occurred: " + std::string(e.what()));
    }
    catch (...)
    {
      SQL_LOG_ERROR("Unknown exception in QueryWorker::Execute");
      SetError("Unknown exception occurred");
    }
  }

  void QueryWorker::OnOK()
  {
    const Napi::Env env = Env();
    Napi::HandleScope scope(env);
    SQL_LOG_DEBUG("QueryWorker::OnOK");
    // Convert query result to JavaScript object
    Napi::Object resultObj = result_->toJSObject(env);

    // Call the callback with null error and result
    Callback().Call({env.Null(), resultObj});
  }
}