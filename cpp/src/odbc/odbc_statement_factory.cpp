#include <odbc/odbc_statement_factory.h>
#include <odbc/connection_handles.h>
#include <odbc/odbc_error.h>
#include <odbc/odbc_handles.h>
#include <odbc/odbc_statement.h>
#include <odbc/odbc_statement_legacy.h>
#include <utils/Logger.h>

namespace mssql {
std::shared_ptr<IOdbcStatementHandle> OdbcStatementHandleFactory::createStatement() {
  return std::make_shared<OdbcStatementHandleImpl>();
}

std::shared_ptr<IOdbcStatement> OdbcStatementFactory::MakeStatement(
    std::shared_ptr<IOdbcConnectionHandle> connectionHandle,
    std::shared_ptr<IOdbcApi> odbcApi,
    StatementType type,
    std::shared_ptr<OdbcErrorHandler> errorHandler,
    const std::shared_ptr<QueryOperationParams> operationParams) {
  auto id = factory_.getNextId();
  SQL_LOG_DEBUG_STREAM("MakeStatement - create a new statement handle with id = " << id);
  auto handle = connectionHandles_->checkout(id);
  if (!handle) {
    SQL_LOG_ERROR_STREAM("MakeStatement - failed to checkout statement handle with id = " << id);
    return nullptr;
  }
  StatementHandle statementHandle(connectionId_, id);

  switch (type) {
    case StatementType::Legacy:
      return std::make_shared<OdbcStatementLegacy>(
          connectionHandle, handle, errorHandler, odbcApi, statementHandle, operationParams);

    case StatementType::Transient:
      return std::make_shared<TransientStatement>(
          handle, errorHandler, operationParams, odbcApi, statementHandle);

    case StatementType::Prepared:
      return std::make_shared<PreparedStatement>(
          handle, errorHandler, operationParams, odbcApi, statementHandle);

    case StatementType::TVP:
      return std::make_shared<TvpStatement>(
          handle, errorHandler, operationParams, odbcApi, statementHandle);

    default:
      return nullptr;
  }
}

void OdbcStatementFactory::RemoveStatement(int statementId) {
  SQL_LOG_DEBUG_STREAM("RemoveStatement - checkin statementId = " << statementId);
  connectionHandles_->checkin(statementId);
  statements_.erase(statementId);
}

std::shared_ptr<IOdbcStatement> OdbcStatementFactory::GetStatement(int statementId) {
  auto it = statements_.find(statementId);
  if (it != statements_.end()) {
    return it->second;
  }
  SQL_LOG_ERROR_STREAM("GetStatement failed for id " << statementId);
  return nullptr;
}

std::shared_ptr<IOdbcStatement> OdbcStatementFactory::CreateStatement(
    std::shared_ptr<IOdbcConnectionHandle> connectionHandle,
    std::shared_ptr<IOdbcApi> odbcApi,
    StatementType type,
    std::shared_ptr<OdbcErrorHandler> errorHandler,
    const std::shared_ptr<QueryOperationParams> operationParams) {
  SQL_LOG_TRACE_STREAM("CreateStatement type " << (int)type);

  auto statement = MakeStatement(connectionHandle, odbcApi, type, errorHandler, operationParams);
  if (statement) {
    auto statementId = statement->GetStatementHandle().getStatementId();
    statements_[statementId] = statement;
  } else {
    SQL_LOG_ERROR_STREAM("CreateStatement failed for type " << (int)type);
  }
  return statement;
}

}  // namespace mssql