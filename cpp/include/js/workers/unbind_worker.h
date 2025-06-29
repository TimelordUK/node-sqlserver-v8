#pragma once

#include "js/workers/odbc_async_worker.h"
#include "odbc/odbc_connection.h"
#include "core/result_buffer.h"
#include "core/bound_datum_set.h"

namespace mssql {

class UnbindWorker : public OdbcAsyncWorker {
 public:
  UnbindWorker(Napi::Function& callback, IOdbcConnection* connection, const int statementId)
      : OdbcAsyncWorker(callback, connection), statementId_(statementId), success_(false) {}

  void Execute() override {
    SQL_LOG_DEBUG_STREAM("Unbinding parameters for statement " << statementId_);

    try {
      outputParams_ = connection_->UnbindStatement(statementId_);
      if (outputParams_) {
        // Get the output parameters from the statement
        success_ = true;
        SQL_LOG_DEBUG_STREAM("Statement " << statementId_ << " parameters unbound successfully");
      } else {
        errorMessage_ = "Statement not found";
        SQL_LOG_WARNING_STREAM("Statement " << statementId_ << " not found for unbind");
      }
    } catch (const std::exception& e) {
      success_ = false;
      errorMessage_ = e.what();
      SQL_LOG_ERROR_STREAM("Error unbinding parameters: " << e.what());
    }
  }

  void OnOK() override {
    Napi::Env env = Env();
    if (success_) {
      auto arr = outputParams_->unbind(env);
      Callback().Call({env.Null(), arr});
    } else {
      Napi::Error error = Napi::Error::New(env, errorMessage_);
      Callback().Call({error.Value(), env.Undefined()});
    }
  }

  void OnError(const Napi::Error& error) override {
    Napi::Env env = Env();
    Callback().Call({error.Value(), env.Undefined()});
  }

 private:
  int statementId_;
  bool success_;
  std::string errorMessage_;
  std::shared_ptr<BoundDatumSet> outputParams_;
};

}  // namespace mssql