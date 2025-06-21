#pragma once

#include <js/workers/odbc_async_worker.h>
#include <odbc/odbc_connection.h>

namespace mssql {
class Connection;

class CommitWorker : public OdbcAsyncWorker {
 public:
  CommitWorker(Napi::Function& callback,
               IOdbcConnection* connection,
               Connection* parent);

  void Execute() override;
  void OnOK() override;

 private:
  Connection* parent_;
};
}  // namespace mssql