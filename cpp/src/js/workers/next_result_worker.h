cd #pragma once

#include "workers/odbc_async_worker.h"
#include "statement_handle.h"

namespace mssql
{
  class NextResultWorker : public OdbcAsyncWorker
  {
  public:
    NextResultWorker(Napi::Function &callback,
                    IOdbcConnection *connection,
                    const StatementHandle &statementHandle,
                    size_t rowCount);

    void Execute() override;

  private:
    StatementHandle statementHandle_;
    size_t rowCount_;
  };
} // namespace mssql 