#pragma once

#include "js/workers/odbc_async_worker.h"
#include "odbc/odbc_driver_types.h"

namespace mssql {

class FetchRowsWorker : public OdbcAsyncWorker {
 public:
  FetchRowsWorker(Napi::Function& callback,
                  IOdbcConnection* connection,
                  const StatementHandle& statementHandle,
                  const QueryOptions& options);

  void Execute() override;
  void OnOK() override;  // Override OnOK for custom row handling

  std::shared_ptr<IOdbcStatement> GetStatement() const {
    return connection_->GetStatement(statementHandle_.getStatementId());
  }

 private:
  StatementHandle statementHandle_;
  QueryOptions options_;
  bool has_error_ = false;
};
}  // namespace mssql