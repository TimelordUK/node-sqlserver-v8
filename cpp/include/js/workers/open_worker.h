#pragma once

#include "workers/odbc_async_worker.h"
#include "odbc/odbc_driver_types.h"
#include "odbc/odbc_connection.h"
#include "common/string_utils.h"

namespace mssql
{
  class Connection;

  class OpenWorker : public OdbcAsyncWorker
  {
  public:
    OpenWorker(Napi::Function &callback,
               IOdbcConnection *connection,
               Connection *parent,
               const const std::u16string &connectionString);

    void Execute() override;
    void OnOK() override;

  private:
    std::u16string connectionString_;
    IOdbcConnection *connection;
    Connection *parent_;
  };
} // namespace mssql