#pragma once

#include "workers/odbc_async_worker.h"
#include "odbc/odbc_driver_types.h"
#include "odbc/odbc_connection.h"

namespace mssql
{
  class Connection;

  class CloseWorker : public OdbcAsyncWorker
  {
  public:
    CloseWorker(Napi::Function &callback,
               IOdbcConnection *connection,
               Connection *parent);

    void Execute() override;
    void OnOK() override;

  private:
    Connection *parent_;
    // Using connection_ inherited from OdbcAsyncWorker
  };
} // namespace mssql