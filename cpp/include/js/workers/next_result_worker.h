#pragma once

#include <js/workers/odbc_async_worker.h>
#include <odbc/odbc_driver_types.h>

namespace mssql {
class NextResultWorker : public OdbcAsyncWorker {
 public:
  NextResultWorker(Napi::Function& callback,
                   IOdbcConnection* connection,
                   const StatementHandle& statementHandle);

  void Execute() override;
  void OnOK() override;

  std::shared_ptr<IOdbcStatement> GetStatement() const {
    return connection_->GetStatement(statementHandle_.getStatementId());
  }

 private:
  StatementHandle statementHandle_;
};
}  // namespace mssql