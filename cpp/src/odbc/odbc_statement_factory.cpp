#include "odbc_statement_factory.h"
#include "odbc_handles.h"
#include "odbc_error.h"
#include "odbc_statement.h"
#include "Logger.h"

namespace mssql
{
  std::shared_ptr<IOdbcStatementHandle> OdbcStatementHandleFactory::createStatement()
  {
    return std::make_shared<OdbcStatementHandleImpl>();
  }

  std::shared_ptr<OdbcStatement> OdbcStatementFactory::MakeStatement(
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

  void OdbcStatementFactory::RemoveStatement(int statementId)
  {
    statements_.erase(statementId);
  }

  std::shared_ptr<OdbcStatement> OdbcStatementFactory::GetStatement(int statementId)
  {
    auto it = statements_.find(statementId);
    if (it != statements_.end())
    {
      return it->second;
    }
    SQL_LOG_ERROR_STREAM("GetStatement failed for id " << statementId);
    return nullptr;
  }

  std::shared_ptr<OdbcStatement> OdbcStatementFactory::CreateStatement(
      std::shared_ptr<IOdbcApi> odbcApi,
      OdbcStatement::Type type,
      std::shared_ptr<IOdbcStatementHandle> handle,
      std::shared_ptr<OdbcErrorHandler> errorHandler,
      const std::string &query,
      const std::string &tvpType)
  {
    SQL_LOG_TRACE_STREAM("CreateStatement type " << (int)type);

    auto statement = MakeStatement(odbcApi, type, handle, errorHandler, query, tvpType);
    if (statement)
    {
      statements_[statement->getStatementHandle().getStatementId()] = statement;
    }
    else
    {
      SQL_LOG_ERROR_STREAM("CreateStatement failed for type " << (int)type);
    }
    return statement;
  }
} // namespace mssql