#include <platform.h>
#include <common/odbc_common.h>
#include <js/Connection.h>

#include <chrono>
#include <functional>
#include <memory>
#include <string>
#include <thread>
#include <vector>

#include <core/query_parameter.h>
#include <core/query_result.h>
#include <js/js_object_mapper.h>
#include <js/workers/close_worker.h>
#include <js/workers/fetch_rows_worker.h>
#include <js/workers/next_result_worker.h>
#include <js/workers/open_worker.h>
#include <js/workers/query_worker.h>
#include <js/workers/release_worker.h>
#include <js/workers/worker_base.h>
#include <odbc/odbc_connection.h>
#include <odbc/odbc_connection_factory.h>
#include <odbc/odbc_driver_types.h>
#include <odbc/odbc_environment.h>
#include <odbc/odbc_error.h>
#include <odbc/parameter_set.h>

namespace mssql {
// Initialize static constructor reference
Napi::FunctionReference Connection::constructor;

// Initialize the class and export it to the module
Napi::Object Connection::Init(Napi::Env env, Napi::Object exports) {
  // Initialize ODBC environment
  if (!OdbcConnection::InitializeEnvironment()) {
    Napi::Error::New(env, "Failed to initialize ODBC environment").ThrowAsJavaScriptException();
    return exports;
  }

  // Define class
  const Napi::Function func =
      DefineClass(env,
                  "Connection",
                  {
                      InstanceMethod("open", &Connection::Open),
                      InstanceMethod("close", &Connection::Close),
                      InstanceMethod("query", &Connection::Query),
                      InstanceMethod("fetchRows", &Connection::FetchRows),
                      InstanceMethod("nextResultSet", &Connection::NextResultSet),
                      InstanceMethod("cancelStatement", &Connection::CancelStatement),
                      InstanceMethod("releaseStatement", &Connection::ReleaseStatement),
                  });

  // Create persistent reference to constructor
  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  // Export the class
  exports.Set("Connection", func);
  return exports;
}

// Constructor
Connection::Connection(const Napi::CallbackInfo& info) : Napi::ObjectWrap<Connection>(info) {
  SQL_LOG_DEBUG("Connection ctor");
  const Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  // Create internal ODBC connection - uses the shared environment
  odbcConnection_ = OdbcConnectionFactory::CreateConnection();
}

// Destructor
Connection::~Connection() {
  SQL_LOG_DEBUG("~Connection dtor");
  // Make sure connection is closed
  if (isConnected_) {
    odbcConnection_->Close();
  }
}

// ConnectionWorkerBase class has been moved to worker_base.h

// Open connection method - supports both callback and Promise
Napi::Value Connection::Open(const Napi::CallbackInfo& info) {
  SQL_LOG_DEBUG("Connection::Open");
  const Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  // Check if we already have a connection
  if (isConnected_) {
    Napi::Error::New(env, "Connection is already open").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get connection string
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Connection string expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  const auto connectionString = info[0].As<Napi::String>().Utf16Value();

  // Check for callback (last argument)
  Napi::Function callback;

  if (info.Length() > 1 && info[info.Length() - 1].IsFunction()) {
    callback = info[info.Length() - 1].As<Napi::Function>();
  } else {
    // No callback provided, we'll use a Promise
    // Create a deferred Promise
    Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);
    SQL_LOG_DEBUG("Connection - use Promise");

    // Create a callback that resolves/rejects the promise
    callback = Napi::Function::New(env, [deferred](const Napi::CallbackInfo& info) {
      const Napi::Env env = info.Env();
      if (info[0].IsNull() || info[0].IsUndefined()) {
        deferred.Resolve(info[1]);
      } else {
        // The error object might be enhanced with ODBC details
        deferred.Reject(info[0]);
      }
      return env.Undefined();
    });

    auto worker = new OpenWorker(callback, odbcConnection_.get(), this, connectionString);

    worker->Queue();

    // Return the promise
    return deferred.Promise();
  }

  SQL_LOG_DEBUG("Connection - use ConnectionWorker");
  auto worker = MakeConnectionWorker(
      callback,
      odbcConnection_.get(),
      this,
      [connectionString](IOdbcConnection* conn) {
        SQL_LOG_DEBUG("Connection::Open - invoking native open");
        return conn->Open(connectionString, 0);
      },
      [this]() {
        // This will be called on success in the OnOK method
        SQL_LOG_DEBUG("Connection::Open - setting connection state to open");
        this->SetConnected(true);
      });
  worker->Queue();

  return env.Undefined();
}

// Close connection method
Napi::Value Connection::Close(const Napi::CallbackInfo& info) {
  SQL_LOG_DEBUG("Connection::Close");
  const Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  // Check if we have a connection to close
  if (!isConnected_) {
    Napi::Error::New(env, "Connection is not open").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Check for callback (last argument)
  Napi::Function callback;
  if (info.Length() > 0 && info[info.Length() - 1].IsFunction()) {
    callback = info[info.Length() - 1].As<Napi::Function>();
  } else {
    // Synchronous close is still possible without a callback
    std::string errorMessage;

    if (bool success = odbcConnection_->Close(); !success) {
      Napi::Error::New(env, errorMessage).ThrowAsJavaScriptException();
      return env.Undefined();
    }

    isConnected_ = false;
    return Napi::Boolean::New(env, true);
  }

  auto worker = new CloseWorker(callback, odbcConnection_.get(), this);
  worker->Queue();

  return env.Undefined();
}

Napi::Value Stubbed(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();

  if (info.Length() > 1 && info[info.Length() - 1].IsFunction()) {
    const auto callback = info[info.Length() - 1].As<Napi::Function>();
    Napi::Object rows = Napi::Object::New(env);
    callback.Call({env.Null(), rows});
  }

  return env.Undefined();
}

Napi::Value Connection::FetchRows(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  // Check if we have a connection
  if (!isConnected_) {
    Napi::Error::New(env, "Connection is not open").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Validate statement handle
  if (info.Length() < 1 || !info[0].IsObject()) {
    Napi::TypeError::New(env, "Statement handle expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get the statement handle from the first parameter
  Napi::Object handleObj = info[0].As<Napi::Object>();
  StatementHandle statementHandle = JsObjectMapper::toStatementHandle(handleObj);

  if (!statementHandle.isValid()) {
    Napi::Error::New(env, "Invalid statement handle").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get the number of rows to fetch (optional, default to 1000)
  size_t rowCount = 1000;
  if (info.Length() > 1 && info[1].IsNumber()) {
    rowCount = info[1].As<Napi::Number>().Uint32Value();
  }

  // Check for callback (last argument)
  Napi::Function callback;

  if (info.Length() > 1 && info[info.Length() - 1].IsFunction()) {
    callback = info[info.Length() - 1].As<Napi::Function>();
  } else {
    // No callback provided, we'll use a Promise
    // Create a deferred Promise
    Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);

    // Create a callback that resolves/rejects the promise
    callback = Napi::Function::New(env, [deferred](const Napi::CallbackInfo& info) {
      const Napi::Env env = info.Env();
      if (info[0].IsNull() || info[0].IsUndefined()) {
        deferred.Resolve(info[1]);
      } else {
        deferred.Reject(info[0]);
      }
      return env.Undefined();
    });

    // Create and queue the worker
    auto worker = new FetchRowsWorker(callback, odbcConnection_.get(), statementHandle, rowCount);
    worker->Queue();

    // Return the promise
    return deferred.Promise();
  }

  // If we got here, we're using a callback
  auto worker = new FetchRowsWorker(callback, odbcConnection_.get(), statementHandle, rowCount);
  worker->Queue();

  return env.Undefined();
}

Napi::Value Connection::NextResultSet(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  // Check if we have a connection
  if (!isConnected_) {
    Napi::Error::New(env, "Connection is not open").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Validate statement handle
  if (info.Length() < 1 || !info[0].IsObject()) {
    Napi::TypeError::New(env, "Statement handle expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get the statement handle from the first parameter
  Napi::Object handleObj = info[0].As<Napi::Object>();
  StatementHandle statementHandle = JsObjectMapper::toStatementHandle(handleObj);

  if (!statementHandle.isValid()) {
    Napi::Error::New(env, "Invalid statement handle").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Check for callback (last argument)
  Napi::Function callback;

  // Get the number of rows to fetch (optional, default to 1000)
  size_t rowCount = 1000;
  if (info.Length() > 1 && info[1].IsNumber()) {
    rowCount = info[1].As<Napi::Number>().Uint32Value();
  }

  if (info.Length() > 1 && info[info.Length() - 1].IsFunction()) {
    callback = info[info.Length() - 1].As<Napi::Function>();
  } else {
    // No callback provided, we'll use a Promise
    // Create a deferred Promise
    Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);

    // Create a callback that resolves/rejects the promise
    callback = Napi::Function::New(env, [deferred](const Napi::CallbackInfo& info) {
      const Napi::Env env = info.Env();
      if (info[0].IsNull() || info[0].IsUndefined()) {
        deferred.Resolve(info[1]);
      } else {
        deferred.Reject(info[0]);
      }
      return env.Undefined();
    });

    // Create and queue the worker
    auto worker = new NextResultWorker(callback, odbcConnection_.get(), statementHandle, rowCount);
    worker->Queue();

    // Return the promise
    return deferred.Promise();
  }

  // If we got here, we're using a callback
  auto worker = new NextResultWorker(callback, odbcConnection_.get(), statementHandle, rowCount);
  worker->Queue();

  return env.Undefined();
}

Napi::Value Connection::CancelStatement(const Napi::CallbackInfo& info) {
  return Stubbed(info);
}

Napi::Value Connection::ReleaseStatement(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  // Check if we have a connection
  if (!isConnected_) {
    Napi::Error::New(env, "Connection is not open").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Validate statement handle
  if (info.Length() < 1 || !info[0].IsObject()) {
    Napi::TypeError::New(env, "Statement handle expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get the statement handle from the first parameter
  Napi::Object handleObj = info[0].As<Napi::Object>();
  StatementHandle statementHandle = JsObjectMapper::toStatementHandle(handleObj);

  if (!statementHandle.isValid()) {
    Napi::Error::New(env, "Invalid statement handle").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Check for callback (last argument)
  Napi::Function callback;

  if (info.Length() > 1 && info[info.Length() - 1].IsFunction()) {
    callback = info[info.Length() - 1].As<Napi::Function>();
  } else {
    // No callback provided, we'll use a Promise
    // Create a deferred Promise
    Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);

    // Create a callback that resolves/rejects the promise
    callback = Napi::Function::New(env, [deferred](const Napi::CallbackInfo& info) {
      const Napi::Env env = info.Env();
      if (info[0].IsNull() || info[0].IsUndefined()) {
        deferred.Resolve(info[1]);
      } else {
        deferred.Reject(info[0]);
      }
      return env.Undefined();
    });

    // Create and queue the worker
    auto worker = new ReleaseWorker(callback, odbcConnection_.get(), statementHandle);
    worker->Queue();

    // Return the promise
    return deferred.Promise();
  }

  // If we got here, we're using a callback
  auto worker = new ReleaseWorker(callback, odbcConnection_.get(), statementHandle);
  worker->Queue();

  return env.Undefined();
}

// Implement Query method
Napi::Value Connection::Query(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  // Check if we have a connection
  if (!isConnected_) {
    Napi::Error::New(env, "Connection is not open").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Get SQL query text
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "SQL query text expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string sqlText = info[0].As<Napi::String>().Utf8Value();

  // Get parameters array (optional)
  Napi::Array params = Napi::Array::New(env, 0);
  if (info.Length() > 1 && info[1].IsArray()) {
    params = info[1].As<Napi::Array>();
  }

  // Check for callback (last argument)
  Napi::Function callback;

  if (info.Length() > 1 && info[info.Length() - 1].IsFunction()) {
    callback = info[info.Length() - 1].As<Napi::Function>();
  } else {
    // No callback provided, we'll use a Promise
    // Create a deferred Promise
    Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);

    // Create a callback that resolves/rejects the promise
    callback = Napi::Function::New(env, [deferred](const Napi::CallbackInfo& info) {
      const Napi::Env env = info.Env();
      if (info[0].IsNull() || info[0].IsUndefined()) {
        deferred.Resolve(info[1]);
      } else {
        deferred.Reject(info[0]);
      }
      return env.Undefined();
    });

    // Create and queue the worker
    const auto worker = new QueryWorker(callback, odbcConnection_.get(), sqlText, params);
    worker->Queue();

    // Return the promise
    return deferred.Promise();
  }

  // If we got here, we're using a callback
  const auto worker = new QueryWorker(callback, odbcConnection_.get(), sqlText, params);
  worker->Queue();

  return env.Undefined();
}
}  // namespace mssql