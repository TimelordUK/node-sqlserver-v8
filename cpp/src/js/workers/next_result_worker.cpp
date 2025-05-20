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
    if (!connection_->TryReadNextResult(statementHandle_.getStatementId(), result_)) {
      const auto& errors = connection_->GetErrors();
      if (!errors.empty()) {
        const std::string errorMessage = errors[0]->message;
        SetError(errorMessage);
      } else {
        SetError("Unknown error occurred during query execution");
      }
    }
  } catch (const std::exception& e) {
    SQL_LOG_ERROR("Exception in QueryWorker::Execute: " + std::string(e.what()));
    SetError("Exception occurred: " + std::string(e.what()));
  } catch (...) {
    SQL_LOG_ERROR("Unknown exception in QueryWorker::Execute");
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
    Callback().Call({env.Null(), metadata});
  } catch (const std::exception& e) {
    // Call the callback with an error
    Callback().Call({Napi::Error::New(env, e.what()).Value(), env.Null()});
  }
}
}  // namespace mssql