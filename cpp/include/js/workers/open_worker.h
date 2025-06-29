#pragma once

#include <js/workers/odbc_async_worker.h>
#include <odbc/odbc_driver_types.h>
#include <odbc/odbc_connection.h>
#include <common/string_utils.h>

namespace mssql {
class Connection;

class OpenWorker : public OdbcAsyncWorker {
 public:
  OpenWorker(Napi::Function& callback,
             IOdbcConnection* connection,
             Connection* parent,
             const std::u16string& connectionString);

  void Execute() override;
  void OnOK() override;

 private:
  Connection* parent_;
  std::u16string connectionString_;
  // Using connection_ inherited from OdbcAsyncWorker
  int connectionId_;
};
}  // namespace mssql