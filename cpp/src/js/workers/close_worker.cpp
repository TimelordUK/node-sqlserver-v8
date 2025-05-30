#include <platform.h>
#include <common/odbc_common.h>
#include <js/workers/close_worker.h>

#include <utils/Logger.h>

#include <js/Connection.h>
#include <js/js_object_mapper.h>
#include <odbc/odbc_connection.h>
#include <odbc/odbc_row.h>

namespace mssql {
CloseWorker::CloseWorker(Napi::Function& callback, IOdbcConnection* connection, Connection* parent)
    : OdbcAsyncWorker(callback, connection), parent_(parent) {
  SQL_LOG_DEBUG("CloseWorker constructor");
}

void CloseWorker::Execute() {
  try {
    SQL_LOG_DEBUG("Executing CloseWorker");

    if (!connection_->Close()) {
      SetError("Failed to close connection");
      return;
    }
  } catch (const std::exception& e) {
    SQL_LOG_ERROR("Exception in CloseWorker::Execute: " + std::string(e.what()));
    SetError("Exception occurred: " + std::string(e.what()));
  } catch (...) {
    SQL_LOG_ERROR("Unknown exception in CloseWorker::Execute");
    SetError("Unknown exception occurred");
  }
}

void CloseWorker::OnOK() {
  const Napi::Env env = Env();
  Napi::HandleScope scope(env);
  SQL_LOG_DEBUG("CloseWorker::OnOK - setting connection state to closed");
  parent_->SetConnected(false);
  
  // Immediately release the native connection resources
  SQL_LOG_DEBUG("CloseWorker::OnOK - releasing native connection resources");
  parent_->ReleaseConnection();

  try {
    // Call the callback with the result
    Callback().Call({env.Null(), Napi::Boolean::New(env, true)});
  } catch (const std::exception& e) {
    // Call the callback with an error
    Callback().Call({Napi::Error::New(env, e.what()).Value(), env.Null()});
  }
}
}  // namespace mssql