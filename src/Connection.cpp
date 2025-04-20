#include "Connection.h"
#include "OdbcConnection.h"
#include <thread>
#include <chrono>

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
        Napi::Function func = DefineClass(env, "Connection",
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
        Napi::Env env = info.Env();
        Napi::HandleScope scope(env);

        // Create internal ODBC connection
        odbcConnection_ = std::make_unique<OdbcConnection>();
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

    // Open connection method - supports both callback and Promise
    Napi::Value Connection::Open(const Napi::CallbackInfo &info)
    {
        SQL_LOG_DEBUG("Connection::Open");
        Napi::Env env = info.Env();
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

        std::string connectionString = info[0].As<Napi::String>().Utf8Value();

        // Check for callback (last argument)
        Napi::Function callback;
        bool usePromise = false;

        if (info.Length() > 1 && info[info.Length() - 1].IsFunction())
        {
            callback = info[info.Length() - 1].As<Napi::Function>();
        }
        else
        {
            // No callback provided, we'll use a Promise
            usePromise = true;
            // Create a deferred Promise
            Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);
            SQL_LOG_DEBUG("Connection - use Promise");
            // Create a callback that resolves/rejects the promise
            callback = Napi::Function::New(env, [deferred](const Napi::CallbackInfo &info)
                                           {
                    Napi::Env env = info.Env();
                    if (info[0].IsNull() || info[0].IsUndefined()) {
                        deferred.Resolve(info[1]);
                    }
                    else {
                        deferred.Reject(info[0]);
                    }
                    return env.Undefined(); });

            // Create and queue the worker
            auto worker = new ConnectionWorker(
                callback,
                odbcConnection_.get(),
                connectionString,
                this);
            worker->Queue();

            // Return the promise
            return deferred.Promise();
        }
        SQL_LOG_DEBUG("Connection - use ConnectionWorker");
        // If we got here, we're using a callback
        auto worker = new ConnectionWorker(
            callback,
            odbcConnection_.get(),
            connectionString,
            this);
        worker->Queue();

        return env.Undefined();
    }

    // Close connection method
    Napi::Value Connection::Close(const Napi::CallbackInfo &info)
    {
        SQL_LOG_DEBUG("Connection::Close");
        Napi::Env env = info.Env();
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
            bool success = odbcConnection_->Close();

            if (!success)
            {
                Napi::Error::New(env, errorMessage).ThrowAsJavaScriptException();
                return env.Undefined();
            }

            isConnected_ = false;
            return Napi::Boolean::New(env, true);
        }

        // For callback approach, use an AsyncWorker like we do for open
        auto worker = new ConnectionCloseWorker(
            callback,
            odbcConnection_.get(),
            this);
        worker->Queue();

        return env.Undefined();
    }

    ConnectionWorker::ConnectionWorker(Napi::Function &callback,
                                       OdbcConnection *connection,
                                       const std::string &connectionString,
                                       Connection *parent)
        : Napi::AsyncWorker(callback),
          parent_(parent),
          connection_(connection),
          connectionString_(connectionString)
    {
    }

    ConnectionCloseWorker::ConnectionCloseWorker(Napi::Function &callback,
                                                 OdbcConnection *connection,
                                                 Connection *parent)
        : Napi::AsyncWorker(callback),
          parent_(parent),
          connection_(connection)
    {
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
        bool usePromise = false;

        if (info.Length() > 1 && info[info.Length() - 1].IsFunction())
        {
            callback = info[info.Length() - 1].As<Napi::Function>();
        }
        else
        {
            // No callback provided, we'll use a Promise
            usePromise = true;
            // Create a deferred Promise
            Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);

            // Create a callback that resolves/rejects the promise
            callback = Napi::Function::New(env, [deferred](const Napi::CallbackInfo &info)
                                           {
                Napi::Env env = info.Env();
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

    void ConnectionWorker::Execute()
    {
        SQL_LOG_DEBUG("Executing ConnectionWorker");

        // Attempt to open the connection to the database
        if (!connection_->Open(connectionString_))
        {
            // If failed, get error information
            const auto &errors = connection_->GetErrors();
            if (!errors.empty())
            {
                std::string errorMessage = errors[0]->message;
                SQL_LOG_ERROR("Connection error: " + errorMessage);
                SetError(errorMessage);
            }
            else
            {
                SQL_LOG_ERROR("Unknown connection error");
                SetError("Unknown error occurred while opening connection");
            }
        }
        else
        {
            SQL_LOG_DEBUG("Connection worker completed successfully");
        }
    }

    // This runs on the main JavaScript thread
    void ConnectionWorker::OnOK()
    {
        const Napi::Env env = Env();
        Napi::HandleScope scope(env);

        // Update connection state through method
        if (parent_)
        {
            parent_->SetConnected(true);
        }

        // Create a result object
        Napi::Object result = Napi::Object::New(env);
        result.Set("connected", Napi::Boolean::New(env, true));

        // Call the callback with null error and result
        Callback().Call({env.Null(), result});
    }

    void ConnectionCloseWorker::Execute()
    {
        SQL_LOG_DEBUG("Executing ConnectionCloseWorker");

        // Attempt to open the connection to the database
        if (!connection_->Close())
        {
            // If failed, get error information
            const auto &errors = connection_->GetErrors();
            if (!errors.empty())
            {
                std::string errorMessage = errors[0]->message;
                SQL_LOG_ERROR("Connection error: " + errorMessage);
                SetError(errorMessage);
            }
            else
            {
                SQL_LOG_ERROR("Unknown connection error");
                SetError("Unknown error occurred while opening connection");
            }
        }
        else
        {
            SQL_LOG_DEBUG("Connection worker completed successfully");
        }
    }

    // This runs on the main JavaScript thread
    void ConnectionCloseWorker::OnOK()
    {
        const Napi::Env env = Env();
        Napi::HandleScope scope(env);

        // Update connection state through method
        if (parent_)
        {
            parent_->SetConnected(false);
        }

        // Create a result object
        Napi::Object result = Napi::Object::New(env);
        result.Set("connected", Napi::Boolean::New(env, true));

        // Call the callback with null error and result
        Callback().Call({env.Null(), result});
    }

    QueryWorker::QueryWorker(Napi::Function &callback,
                             OdbcConnection *connection,
                             const std::string &sqlText,
                             const Napi::Array &params)
        : Napi::AsyncWorker(callback),
          connection_(connection),
          sqlText_(sqlText)
    {
        // Convert JavaScript parameters to C++ parameters
        const uint32_t length = params.Length();
        parameters_.reserve(length);

        for (uint32_t i = 0; i < length; i++)
        {
            Napi::Value value = params[i];

            if (value.IsString())
            {
                parameters_.push_back(std::make_shared<QueryParameter>(
                    value.As<Napi::String>().Utf8Value()));
            }
            else if (value.IsNumber())
            {
                parameters_.push_back(std::make_shared<QueryParameter>(
                    value.As<Napi::Number>().DoubleValue()));
            }
            else if (value.IsBoolean())
            {
                parameters_.push_back(std::make_shared<QueryParameter>(
                    value.As<Napi::Boolean>().Value()));
            }
            else if (value.IsNull() || value.IsUndefined())
            {
                parameters_.push_back(std::make_shared<QueryParameter>());
            }
            // Add other types as needed
        }

        // Initialize result object
        result_ = std::make_shared<QueryResult>();
    }

    void QueryWorker::Execute()
    {

        try
        {
            SQL_LOG_DEBUG_STREAM("Executing QueryWorker " << sqlText_);
            // This will need to be implemented in OdbcConnection
            // Here's a placeholder showing what it might look like
            if (!connection_->ExecuteQuery(sqlText_, parameters_, result_))
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

    Napi::Object mssql::QueryResult::toJSObject(Napi::Env env) const
    {
        const Napi::Object result = Napi::Object::New(env);

        // Create metadata object
        Napi::Array meta = Napi::Array::New(env, columns_.size());
        for (size_t i = 0; i < columns_.size(); i++)
        {
            Napi::Object colInfo = Napi::Object::New(env);
            colInfo.Set("name", Napi::String::New(env, columns_[i].name));
            colInfo.Set("sqlType", Napi::Number::New(env, columns_[i].sqlType));
            meta[i] = colInfo;
        }
        result.Set("meta", meta);

        // Create rows array
        Napi::Array rowsArray = Napi::Array::New(env, rows_.size());
        for (size_t i = 0; i < rows_.size(); i++)
        {
            Napi::Array row = Napi::Array::New(env, rows_[i].size());
            for (size_t j = 0; j < rows_[i].size(); j++)
            {
                row[j] = Napi::String::New(env, rows_[i][j]);
            }
            rowsArray[i] = row;
        }
        result.Set("rows", rowsArray);

        return result;
    }

}