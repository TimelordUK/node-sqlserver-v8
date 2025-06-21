#include <js/workers/rollback_worker.h>

#include <utils/Logger.h>
#include <common/odbc_common.h>
#include <js/Connection.h>
#include <odbc/odbc_connection.h>

namespace mssql {
RollbackWorker::RollbackWorker(Napi::Function& callback,
                               IOdbcConnection* connection,
                               Connection* parent)
    : OdbcAsyncWorker(callback, connection),
      parent_(parent) {
  SQL_LOG_DEBUG("RollbackWorker constructor");
}

void RollbackWorker::Execute() {
  try {
    SQL_LOG_DEBUG("Executing RollbackWorker");

    if (!connection_->RollbackTransaction()) {
      const auto& errors = connection_->GetErrors();
      if (!errors.empty()) {
        errorDetails_ = errors;
        const std::string errorMessage = errors[0]->message;
        SetError(errorMessage);
      } else {
        SetError("Failed to rollback transaction");
      }
      return;
    }
  }
  catch (const std::exception& e) {
    SQL_LOG_ERROR("Exception in RollbackWorker::Execute: " + std::string(e.what()));
    SetError("Exception occurred: " + std::string(e.what()));
  } catch (...) {
    SQL_LOG_ERROR("Unknown exception in RollbackWorker::Execute");
    SetError("Unknown exception occurred");
  }
}

void RollbackWorker::OnOK() {
  const Napi::Env env = Env();
  Napi::HandleScope scope(env);
  SQL_LOG_DEBUG("RollbackWorker::OnOK");

  try {
    // Call the callback with no error (following Node.js convention)
    Callback().Call({env.Undefined()});
  } catch (const std::exception& e) {
    // Call the callback with an error
    Callback().Call({Napi::Error::New(env, e.what()).Value()});
  }
}
}  // namespace mssql