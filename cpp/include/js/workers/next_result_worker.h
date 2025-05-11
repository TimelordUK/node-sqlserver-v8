#pragma once
#include <napi.h>
#include <memory>
#include "odbc/odbc_connection.h"
#include "odbc/odbc_statement.h"
#include "core/query_result.h"
#include "odbc/odbc_error.h"
#include "Logger.h"

namespace mssql
{

  /**
   * @brief Worker for moving to next query for a compound statement
   */
  class NextResultWorker : public Napi::AsyncWorker
  {
  public:
    NextResultWorker(Napi::Function &callback,
                     IOdbcConnection *connection,
                     const StatementHandle &statementHandle,
                     size_t rowCount);

    void Execute() override;
    void OnOK() override;
    void OnError(const Napi::Error &error) override;

  protected:
    shared_ptr<IOdbcStatement> GetStatement() const
    {
      return connection_->GetStatement(statementHandle_.getStatementId());
    }

  private:
    IOdbcConnection *connection_;
    StatementHandle statementHandle_;
    size_t rowCount_;
    std::shared_ptr<QueryResult> result_;
    std::vector<std::shared_ptr<OdbcError>> errorDetails_;
  };

} // namespace mssql