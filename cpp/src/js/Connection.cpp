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
#include <js/workers/bind_query_worker.h>
#include <js/workers/query_worker.h>
#include <js/workers/prepare_worker.h>
#include <js/workers/release_worker.h>
#include <js/workers/cancel_worker.h>
#include <js/workers/unbind_worker.h>
#include <js/workers/begin_transaction_worker.h>
#include <js/workers/commit_worker.h>
#include <js/workers/rollback_worker.h>
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
  auto odbcApi = std::make_shared<RealOdbcApi>();
  if (!OdbcConnection::InitializeEnvironment(odbcApi)) {
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
                      InstanceMethod("bindQuery", &Connection::BindQuery),
                      InstanceMethod("prepare", &Connection::Prepare),
                      InstanceMethod("fetchRows", &Connection::FetchRows),
                      InstanceMethod("nextResultSet", &Connection::NextResultSet),
                      InstanceMethod("releaseStatement", &Connection::ReleaseStatement),
                      InstanceMethod("cancelQuery", &Connection::CancelQuery),
                      InstanceMethod("callProcedure", &Connection::Query),
                      InstanceMethod("unbind", &Connection::Unbind),
                      InstanceMethod("beginTransaction", &Connection::BeginTransaction),
                      InstanceMethod("commit", &Connection::Commit),
                      InstanceMethod("rollback", &Connection::Rollback),
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

// Generic worker factory for callback/promise handling
template <typename WorkerType, typename... Args>
Napi::Value Connection::CreateWorkerWithCallbackOrPromise(const Napi::CallbackInfo& info,
                                                          Args&&... args) {
  const Napi::Env env = info.Env();

  // Check for callback (last argument)
  Napi::Function callback;

  if (info.Length() > 0 && info[info.Length() - 1].IsFunction()) {
    callback = info[info.Length() - 1].As<Napi::Function>();

    // Create and queue the worker with callback
    auto worker = new WorkerType(callback, std::forward<Args>(args)...);
    worker->Queue();

    return env.Undefined();
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

    // Create and queue the worker with promise callback
    auto worker = new WorkerType(callback, std::forward<Args>(args)...);
    worker->Queue();

    // Return the promise
    return deferred.Promise();
  }
}

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

  if (info.Length() > 0 && info[info.Length() - 1].IsFunction()) {
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

  if (info.Length() > 0 && info[info.Length() - 1].IsFunction()) {
    const auto callback = info[info.Length() - 1].As<Napi::Function>();
    Napi::Object rows = Napi::Object::New(env);
    callback.Call({env.Null(), rows});
  }

  return env.Undefined();
}

struct InfoParser {
  StatementHandle statementHandle;
  InfoParser(bool isConnected) : isConnected_(isConnected) {}
  QueryOptions options;
  int queryId = 0;
  std::shared_ptr<QueryOperationParams> operationParams;
  bool isConnected_;

  bool throwIfNotConnected(const Napi::CallbackInfo& info) {
    const Napi::Env env = info.Env();
    if (!isConnected_) {
      Napi::Error::New(env, "Connection is not open").ThrowAsJavaScriptException();
      return false;
    }
    return true;
  }

  bool parseQueryOptions(const Napi::CallbackInfo& info) {
    const Napi::Env env = info.Env();

    if (info.Length() < 2 || !info[2].IsObject()) {
      Napi::TypeError::New(env, "query options expected").ThrowAsJavaScriptException();
      return env.Undefined();
    }

    // Get the statement handle from the first parameter
    Napi::Object optionsObj = info[2].As<Napi::Object>();
    options = JsObjectMapper::toQueryOptions(optionsObj);
    return true;
  }

  bool parseQueryId(const Napi::CallbackInfo& info) {
    const Napi::Env env = info.Env();
    if (!throwIfNotConnected(info)) {
      return false;
    }

    if (info.Length() > 0 && info[0].IsNumber()) {
      queryId = info[0].As<Napi::Number>().Int32Value();
    } else {
      Napi::TypeError::New(env, "query id expected").ThrowAsJavaScriptException();
    }

    return true;
  }

  bool parseStatementHandle(const Napi::CallbackInfo& info) {
    const Napi::Env env = info.Env();
    if (!throwIfNotConnected(info)) {
      return false;
    }

    if (info.Length() > 0 && info[0].IsNumber()) {
      queryId = info[0].As<Napi::Number>().Int32Value();
    }

    if (info.Length() < 2 || !info[1].IsObject()) {
      Napi::TypeError::New(env, "Statement handle expected").ThrowAsJavaScriptException();
      return false;
    }

    // Get the statement handle from the first parameter
    Napi::Object handleObj = info[1].As<Napi::Object>();
    statementHandle = JsObjectMapper::toStatementHandle(handleObj);
    if (!statementHandle.isValid()) {
      Napi::Error::New(env, "Invalid statement handle").ThrowAsJavaScriptException();
      return false;
    }

    return true;
  }

  bool parseOperationParams(const Napi::CallbackInfo& info) {
    const Napi::Env env = info.Env();
    if (!throwIfNotConnected(info)) {
      return false;
    }

    if (info.Length() > 0 && info[0].IsNumber()) {
      queryId = info[0].As<Napi::Number>().Int32Value();
    }

    if (info.Length() < 2 || !info[1].IsObject()) {
      Napi::TypeError::New(env, "Operation params expected").ThrowAsJavaScriptException();
      return false;
    }

    // Get the statement handle from the first parameter
    Napi::Object handleObj = info[1].As<Napi::Object>();
    operationParams = JsObjectMapper::toQueryOperationParams(handleObj);

    return true;
  }
};

Napi::Value Connection::FetchRows(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  InfoParser parser(isConnected_);
  if (!parser.parseStatementHandle(info)) {
    return env.Undefined();
  }
  const auto statementHandle = parser.statementHandle;

  if (!parser.parseQueryOptions(info)) {
    return env.Undefined();
  }
  const auto options = parser.options;

  // Use the generic worker factory
  return CreateWorkerWithCallbackOrPromise<FetchRowsWorker>(
      info, odbcConnection_.get(), statementHandle, options);
}

Napi::Value Connection::NextResultSet(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  InfoParser parser(isConnected_);
  if (!parser.parseStatementHandle(info)) {
    return env.Undefined();
  }
  const auto statementHandle = parser.statementHandle;

  // Use the generic worker factory
  return CreateWorkerWithCallbackOrPromise<NextResultWorker>(
      info, odbcConnection_.get(), statementHandle);
}

Napi::Value Connection::CallProc(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  InfoParser parser(isConnected_);
  if (!parser.parseOperationParams(info)) {
    return env.Undefined();
  }
  return env.Undefined();
}

Napi::Value Connection::CancelQuery(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  InfoParser parser(isConnected_);
  if (!parser.parseQueryId(info)) {
    return env.Undefined();
  }
  const auto queryId = parser.queryId;

  // Use the generic worker factory

  return CreateWorkerWithCallbackOrPromise<CancelWorker>(info, odbcConnection_.get(), queryId);
}

Napi::Value Connection::ReleaseStatement(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  InfoParser parser(isConnected_);
  if (!parser.parseStatementHandle(info)) {
    return env.Undefined();
  }
  const auto statementHandle = parser.statementHandle;

  // Use the generic worker factory
  return CreateWorkerWithCallbackOrPromise<ReleaseWorker>(
      info, odbcConnection_.get(), statementHandle);
}

Napi::Value Connection::Prepare(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  InfoParser parser(isConnected_);
  if (!parser.parseOperationParams(info)) {
    return env.Undefined();
  }

  const auto operationParams = parser.operationParams;
  operationParams->id = parser.queryId;

  // Get parameters array (optional)
  Napi::Array params = Napi::Array::New(env, 0);
  if (info.Length() > 2 && info[2].IsArray()) {
    params = info[2].As<Napi::Array>();
  }

  // Check for state change callback in the operation params object
  Napi::Function stateChangeCallback;
  if (info.Length() > 1 && info[1].IsObject()) {
    Napi::Object paramsObj = info[1].As<Napi::Object>();
    if (paramsObj.Has("stateChangeCallback") && paramsObj.Get("stateChangeCallback").IsFunction()) {
      stateChangeCallback = paramsObj.Get("stateChangeCallback").As<Napi::Function>();
      SQL_LOG_DEBUG("Found state change callback in query params");
    }
  }

  SQL_LOG_DEBUG_STREAM("Connection::Prepare: " + operationParams->toString()
                       << " number params " << params.Length());

  // Use the generic worker factory
  return CreateWorkerWithCallbackOrPromise<PrepareWorker>(
      info, odbcConnection_.get(), operationParams, params, stateChangeCallback);
}

Napi::Value Connection::BindQuery(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  InfoParser parser(isConnected_);

  if (!parser.parseQueryId(info)) {
    return env.Undefined();
  }
  const auto queryId = parser.queryId;

  // Get parameters array (optional)
  Napi::Array params = Napi::Array::New(env, 0);
  if (info.Length() > 1 && info[1].IsArray()) {
    params = info[1].As<Napi::Array>();
  }

  SQL_LOG_DEBUG_STREAM("Connection::BindQuery: " << queryId << " number params "
                                                 << params.Length());

  // Check for state change callback in the operation params object
  Napi::Function stateChangeCallback;
  if (info.Length() > 1 && info[1].IsObject()) {
    Napi::Object paramsObj = info[1].As<Napi::Object>();
    if (paramsObj.Has("stateChangeCallback") && paramsObj.Get("stateChangeCallback").IsFunction()) {
      stateChangeCallback = paramsObj.Get("stateChangeCallback").As<Napi::Function>();
      SQL_LOG_DEBUG("Found state change callback in query params");
    }
  }

  SQL_LOG_DEBUG_STREAM("Connection::BindQuery: " << queryId << " number params "
                                                 << params.Length());

  // Use the generic worker factory
  return CreateWorkerWithCallbackOrPromise<BindQueryWorker>(
      info, odbcConnection_.get(), queryId, params);
}

// Implement Query method
Napi::Value Connection::Query(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  InfoParser parser(isConnected_);
  if (!parser.parseOperationParams(info)) {
    return env.Undefined();
  }

  const auto operationParams = parser.operationParams;
  operationParams->id = parser.queryId;

  // Get parameters array (optional)
  Napi::Array params = Napi::Array::New(env, 0);
  if (info.Length() > 2 && info[2].IsArray()) {
    params = info[2].As<Napi::Array>();
  }

  // Check for state change callback in the operation params object
  Napi::Function stateChangeCallback;
  if (info.Length() > 1 && info[1].IsObject()) {
    Napi::Object paramsObj = info[1].As<Napi::Object>();
    if (paramsObj.Has("stateChangeCallback") && paramsObj.Get("stateChangeCallback").IsFunction()) {
      stateChangeCallback = paramsObj.Get("stateChangeCallback").As<Napi::Function>();
      SQL_LOG_DEBUG("Found state change callback in query params");
    }
  }

  SQL_LOG_DEBUG_STREAM("Connection::Query: " + operationParams->toString()
                       << " number params " << params.Length());

  // Use the generic worker factory
  return CreateWorkerWithCallbackOrPromise<QueryWorker>(
      info, odbcConnection_.get(), operationParams, params, stateChangeCallback);
}

Napi::Value Connection::Unbind(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  InfoParser parser(isConnected_);

  if (!parser.parseQueryId(info)) {
    return env.Undefined();
  }
  const auto queryId = parser.queryId;
  // Use the generic worker factory
  return CreateWorkerWithCallbackOrPromise<UnbindWorker>(info, odbcConnection_.get(), queryId);
}

Napi::Value Connection::BeginTransaction(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  if (!isConnected_) {
    Napi::TypeError::New(env, "Connection is closed").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  SQL_LOG_DEBUG("Connection::BeginTransaction");

  // Use the generic worker factory
  return CreateWorkerWithCallbackOrPromise<BeginTransactionWorker>(
      info, odbcConnection_.get(), this);
}

Napi::Value Connection::Commit(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  if (!isConnected_) {
    Napi::TypeError::New(env, "Connection is closed").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  SQL_LOG_DEBUG("Connection::Commit");

  // Use the generic worker factory
  return CreateWorkerWithCallbackOrPromise<CommitWorker>(info, odbcConnection_.get(), this);
}

Napi::Value Connection::Rollback(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  Napi::HandleScope scope(env);

  if (!isConnected_) {
    Napi::TypeError::New(env, "Connection is closed").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  SQL_LOG_DEBUG("Connection::Rollback");

  // Use the generic worker factory
  return CreateWorkerWithCallbackOrPromise<RollbackWorker>(info, odbcConnection_.get(), this);
}
}  // namespace mssql