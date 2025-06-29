#include <js/workers/open_worker.h>

#include <utils/Logger.h>
#include <common/odbc_common.h>
#include <common/string_utils.h>
#include <js/Connection.h>
#include <js/js_object_mapper.h>
#include <odbc/odbc_connection.h>
#include <odbc/odbc_row.h>
#include <platform.h>

namespace mssql {
OpenWorker::OpenWorker(Napi::Function& callback,
                       IOdbcConnection* connection,
                       Connection* parent,
                       const std::u16string& connectionString)
    : OdbcAsyncWorker(callback, connection),
      parent_(parent),
      connectionString_(connectionString),
      connectionId_(-1) {
#ifdef __APPLE__
  SQL_LOG_DEBUG_U16STREAM("OpenWorker constructor for connection: " << StringUtils::U16StringToUtf8(connectionString_));
#else
  SQL_LOG_DEBUG_U16STREAM("OpenWorker constructor for connection: " << connectionString_);
#endif
}

void OpenWorker::Execute() {
  try {
#ifdef __APPLE__
    SQL_LOG_DEBUG_U16STREAM("Executing OpenWorker for connection: " << StringUtils::U16StringToUtf8(connectionString_));
#else
    SQL_LOG_DEBUG_U16STREAM("Executing OpenWorker for connection: " << connectionString_);
#endif

    if (!connection_->Open(connectionString_, 0)) {
      SetError("Failed to open connection");
      return;
    }
    // connectionId_ = connection->GetConnectionId();
  }

  catch (const std::exception& e) {
    SQL_LOG_ERROR("Exception in FetchRowsWorker::Execute: " + std::string(e.what()));
    SetError("Exception occurred: " + std::string(e.what()));
  } catch (...) {
    SQL_LOG_ERROR("Unknown exception in FetchRowsWorker::Execute");
    SetError("Unknown exception occurred");
  }
}

void OpenWorker::OnOK() {
  const Napi::Env env = Env();
  Napi::HandleScope scope(env);
  SQL_LOG_DEBUG("OpenWorker::OnOK - setting connection state to open");
  parent_->SetConnected(true);

  try {
    // Call the callback with the result
    Callback().Call({env.Null(), Napi::Number::New(env, connectionId_)});
  } catch (const std::exception& e) {
    // Call the callback with an error
    Callback().Call({Napi::Error::New(env, e.what()).Value(), env.Null()});
  }
}
}  // namespace mssql