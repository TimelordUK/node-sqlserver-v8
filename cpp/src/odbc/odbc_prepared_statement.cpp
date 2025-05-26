#include <platform.h>
#include <common/odbc_common.h>
#include <utils/Logger.h>

#include <odbc/iodbc_api.h>
#include <odbc/odbc_error_handler.h>
#include <odbc/odbc_statement.h>
#include <common/string_utils.h>
#include <core/bound_datum_set.h>
namespace mssql {
bool PreparedStatement::Prepare() {
  SQL_LOG_TRACE_STREAM("PreparedStatement::Prepare - Preparing statement: " << query_);

  if (isPrepared_) {
    SQL_LOG_TRACE("Statement already prepared");
    return true;
  }

  state_ = State::STMT_EXECUTING;

  // Convert query to wide string
  auto wideQuery = StringUtils::Utf8ToUtf16(query_);

  // Make sure it's null-terminated
  if (wideQuery->size() > 0 && (*wideQuery)[wideQuery->size() - 1] != L'\0') {
    wideQuery->push_back(L'\0');
  }

  // Log only a reasonable portion of the query to avoid garbage in logs
  std::string queryForLog =
      StringUtils::SafeWideToUtf8ForLogging(reinterpret_cast<SQLWCHAR*>(wideQuery->data()));
  SQL_LOG_TRACE_STREAM("Preparing query: " << queryForLog);

  // Prepare the statement
  auto ret = odbcApi_->SQLPrepareW(statement_->get_handle(),
                                   reinterpret_cast<SQLWCHAR*>(wideQuery->data()),
                                   SQL_NTS);  // Use SQL_NTS to indicate null-terminated string

  if (!errorHandler_->CheckOdbcError(ret)) {
    SQL_LOG_ERROR_STREAM("Statement preparation failed");
    state_ = State::STMT_ERROR;
    return false;
  }

  SQL_LOG_TRACE("Statement prepared successfully");
  isPrepared_ = true;
  state_ = State::STMT_PREPARED;
  return true;
}

bool PreparedStatement::Execute(const std::shared_ptr<BoundDatumSet> parameters,
                                std::shared_ptr<QueryResult>& result) {
  SQL_LOG_TRACE_STREAM("PreparedStatement::Execute - Executing prepared statement with "
                       << parameters->size() << " parameters");

  // Ensure statement is prepared first
  if (!isPrepared_ && !Prepare()) {
    SQL_LOG_ERROR("Failed to prepare statement before execution");
    return false;
  }

  state_ = State::STMT_EXECUTING;

  // Set the statement handle on the result
  result->setHandle(this->GetStatementHandle());

  // Bind parameters
  // for (const auto& param : parameters) {
  //  SQL_LOG_TRACE_STREAM("Binding parameter " << *param);
  // auto ret = param->bind(statement_->get_handle(), odbcApi_);
  // if (!errorHandler_->CheckOdbcError(ret)) {
  //   SQL_LOG_ERROR_STREAM("Failed to bind parameter " << *param);
  //   state_ = State::STMT_ERROR;
  //   return false;
  // }
  // }

  // Execute the statement
  auto ret = odbcApi_->SQLExecute(statement_->get_handle());

  if (!errorHandler_->CheckOdbcError(ret)) {
    SQL_LOG_ERROR_STREAM("Statement execution failed");
    state_ = State::STMT_ERROR;
    return false;
  }

  SQL_LOG_TRACE("Statement executed successfully");
  hasMoreResults_ = true;
  endOfRows_ = false;
  return true;
}
}  // namespace mssql