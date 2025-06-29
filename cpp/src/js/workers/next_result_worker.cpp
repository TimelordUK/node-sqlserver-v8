#include <js/workers/next_result_worker.h>

#include <utils/Logger.h>
#include <common/odbc_common.h>
#include <common/platform.h>
#include <js/js_object_mapper.h>
#include <odbc/odbc_row.h>

namespace mssql {
NextResultWorker::NextResultWorker(Napi::Function& callback,
                                   IOdbcConnection* connection,
                                   const StatementHandle& statementHandle)
    : OdbcAsyncWorker(callback, connection), statementHandle_(statementHandle) {
  SQL_LOG_DEBUG_STREAM(
      "NextResultWorker constructor for statement: " << statementHandle_.toString());
  result_ = std::make_shared<QueryResult>(statementHandle_);
}

void NextResultWorker::Execute() {
  try {
    SQL_LOG_DEBUG_STREAM("Executing NextResult ");
    const auto res = connection_->TryReadNextResult(statementHandle_.getStatementId(), result_);
    errorDetails_ = connection_->GetErrors();
    if (!res) {
      if (!errorDetails_.empty()) {
        const std::string errorMessage = errorDetails_[0]->message;
        SetError(errorMessage);
      }
    }
  } catch (const std::exception& e) {
    SQL_LOG_ERROR("Exception in NextResultWorker::Execute: " + std::string(e.what()));
    SetError("Exception occurred: " + std::string(e.what()));
  } catch (...) {
    SQL_LOG_ERROR("Unknown exception in NextResultWorker::Execute");
    SetError("Unknown exception occurred");
  }
}

void NextResultWorker::OnOK() {
  const Napi::Env env = Env();
  Napi::HandleScope scope(env);
  SQL_LOG_DEBUG("NextResultWorker::OnOK");
  // Validate that we have a callback function as the last argument

  try {
    const auto metadata = GetMetadata();
    const auto errorArg = GetErrors(env);
    if (errorDetails_.empty()) {
      SQL_LOG_DEBUG("NextResultWorker::OnOK: result with no errors");
      Callback().Call({env.Null(), metadata});
    } else {
      SQL_LOG_DEBUG("NextResultWorker::OnOK: result with errors: ");
      Callback().Call({errorArg, metadata});
    }
  } catch (const std::exception& e) {
    // Call the callback with an error
    Callback().Call({Napi::Error::New(env, e.what()).Value(), env.Null()});
  }
}
}  // namespace mssql