#pragma once
#include <napi.h>

#include <atomic>
#include <memory>
#include <mutex>

namespace mssql {
// Forward declarations
class OdbcConnection;
class ParameterSet;
class QueryResult;
class IOdbcConnection;

class Connection : public Napi::ObjectWrap<Connection> {
 public:
  // Initialize the class and register it with the given exports object
  static Napi::Object Init(Napi::Env env, Napi::Object exports);

  // Constructor
  Connection(const Napi::CallbackInfo& info);

  // Destructor
  ~Connection();
  inline void SetConnected(bool connected) {
    isConnected_ = connected;
  }

  // Release the native connection resources immediately
  inline void ReleaseConnection() {
    odbcConnection_.reset();
  }

 private:
  // Static reference to constructor for creating new instances
  static Napi::FunctionReference constructor;

  // JavaScript-accessible methods
  Napi::Value Open(const Napi::CallbackInfo& info);
  Napi::Value Close(const Napi::CallbackInfo& info);
  Napi::Value Prepare(const Napi::CallbackInfo& info);
  Napi::Value BindQuery(const Napi::CallbackInfo& info);
  Napi::Value Query(const Napi::CallbackInfo& info);
  Napi::Value FetchRows(const Napi::CallbackInfo& info);
  Napi::Value NextResultSet(const Napi::CallbackInfo& info);
  Napi::Value ReleaseStatement(const Napi::CallbackInfo& info);
  Napi::Value CancelQuery(const Napi::CallbackInfo& info);
  Napi::Value CallProc(const Napi::CallbackInfo& info);
  Napi::Value Unbind(const Napi::CallbackInfo& info);
  Napi::Value BeginTransaction(const Napi::CallbackInfo& info);
  Napi::Value Commit(const Napi::CallbackInfo& info);
  Napi::Value Rollback(const Napi::CallbackInfo& info);

  // Generic worker factory for callback/promise handling
  template <typename WorkerType, typename... Args>
  Napi::Value CreateWorkerWithCallbackOrPromise(const Napi::CallbackInfo& info, Args&&... args);

  // Internal state
  std::shared_ptr<IOdbcConnection> odbcConnection_;
  bool isConnected_ = false;

  // Helper method to set connection state
};

// QueryWorker class has been moved to query_worker.h
}  // namespace mssql