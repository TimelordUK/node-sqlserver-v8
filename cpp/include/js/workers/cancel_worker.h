#pragma once

#include "js/workers/odbc_async_worker.h"
#include "odbc/odbc_connection.h"
#include "core/result_buffer.h"

namespace mssql {

class CancelWorker : public OdbcAsyncWorker {
 public:
  CancelWorker(Napi::Function& callback, IOdbcConnection* connection, const int queryId)
      : OdbcAsyncWorker(callback, connection), queryId_(queryId), success_(false) {}

  void Execute() override {
    SQL_LOG_DEBUG_STREAM("CancelWorker::Execute() called for query ID: " << queryId_);

    try {
      // Actually cancel the statement
      success_ = connection_->CancelStatement(queryId_);

      if (success_) {
        SQL_LOG_DEBUG_STREAM("Query " << queryId_ << " successfully cancelled");
      } else {
        errorMessage_ = "Failed to cancel statement";
        SQL_LOG_WARNING_STREAM("Query " << queryId_ << " could not be cancelled");
      }
    } catch (const std::exception& e) {
      success_ = false;
      errorMessage_ = e.what();
      SQL_LOG_ERROR_STREAM("Error cancelling statement: " << e.what());
    }
  }

  void OnOK() override {
    Napi::Env env = Env();
    Callback().Call({env.Null(), Napi::Boolean::New(env, success_)});
  }

  void OnError(const Napi::Error& error) override {
    Napi::Env env = Env();
    Callback().Call({error.Value(), env.Undefined()});
  }

 private:
  int queryId_;
  bool success_;
  std::string errorMessage_;
};

}  // namespace mssql