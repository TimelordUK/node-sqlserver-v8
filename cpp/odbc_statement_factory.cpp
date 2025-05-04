#include "odbc_statement_factory.h"
#include "odbc_handles.h"
#include "odbc_error.h"
#include "odbc_statement.h"

namespace mssql
{
  std::shared_ptr<IOdbcStatementHandle> OdbcStatementHandleFactory::createStatement()
  {
    return std::make_shared<OdbcStatementHandleImpl>();
  }

  // StatementFactory implementation
  std::shared_ptr<OdbcStatement> OdbcStatementFactory::CreateStatement(
      std::shared_ptr<IOdbcApi> odbcApi,
      OdbcStatement::Type type,
      std::shared_ptr<IOdbcStatementHandle> handle,
      std::shared_ptr<OdbcErrorHandler> errorHandler,
      const std::string &query,
      const std::string &tvpType)
  {
    auto id = factory_.getNextId();
    StatementHandle statementHandle(connectionId_, id);

    switch (type)
    {
    case OdbcStatement::Type::Transient:
      return std::make_shared<TransientStatement>(
          handle, errorHandler, query, odbcApi, statementHandle);

    case OdbcStatement::Type::Prepared:
      return std::make_shared<PreparedStatement>(
          handle, errorHandler, query, odbcApi, statementHandle);

    case OdbcStatement::Type::TVP:
      return std::make_shared<TvpStatement>(
          handle, errorHandler, query, tvpType, odbcApi, statementHandle);

    default:
      return nullptr;
    }
  }
} // namespace mssql