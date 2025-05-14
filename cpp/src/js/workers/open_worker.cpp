#include "platform.h"
#include "common/odbc_common.h"
#include "js/js_object_mapper.h"
#include "odbc/odbc_row.h"
#include "js/workers/open_worker.h"
#include "Logger.h"

namespace mssql
{
  OpenWorker::OpenWorker(Napi::Function &callback,
                         IOdbcConnection *connection,
                         Connection *parent,
                         const std::u16string &connectionString)
      : OdbcAsyncWorker(callback, connection),
        parent_(parent),
        connectionString_(connectionString)
  {
    SQL_LOG_DEBUG_STREAM("OpenWorker constructor for connection: " << connectionString_);
  }

  void OpenWorker::Execute()
  {
    try
    {
      SQL_LOG_DEBUG_STREAM("Executing OpenWorker for connection: " << connectionString_);

      if (!connection->Open(connectionString_))
      {
        SetError("Failed to open connection");
        return;
      }
      connectionId_ = connection->GetConnectionId();
    }

    catch (const std::exception &e)
    {
      SQL_LOG_ERROR("Exception in FetchRowsWorker::Execute: " + std::string(e.what()));
      SetError("Exception occurred: " + std::string(e.what()));
    }
    catch (...)
    {
      SQL_LOG_ERROR("Unknown exception in FetchRowsWorker::Execute");
      SetError("Unknown exception occurred");
    }
  }

  void OpenWorker::OnOK()
  {
    const Napi::Env env = Env();
    Napi::HandleScope scope(env);
    SQL_LOG_DEBUG("OpenWorker::OnOK - setting connection state to open");
    parent_->SetConnected(true);
    try
    {
      // Call the callback with the result
      Callback().Call({env.Null(), connectionId_});
    }
    catch (const std::exception &e)
    {
      // Call the callback with an error
      Callback().Call({Napi::Error::New(env, e.what()).Value(), env.Null()});
    }
  }
} // namespace mssql