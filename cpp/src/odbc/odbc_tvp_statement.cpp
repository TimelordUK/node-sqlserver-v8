#include <platform.h>
#include <common/odbc_common.h>
#include <utils/Logger.h>

#include <odbc/iodbc_api.h>
#include <odbc/odbc_error_handler.h>
#include <odbc/odbc_statement.h>
#include <common/string_utils.h>

namespace mssql {
bool TvpStatement::BindTvpColumns(const std::vector<std::string>& columnNames) {
  SQL_LOG_TRACE_STREAM("TvpStatement::BindTvpColumns - Binding " << columnNames.size()
                                                                 << " columns");

  if (isColumnsBound_) {
    SQL_LOG_TRACE("Columns already bound");
    return true;
  }

  // TVP specific implementation goes here
  // This is a placeholder implementation
  isColumnsBound_ = true;
  return true;
}

bool TvpStatement::Execute(const std::vector<std::shared_ptr<QueryParameter>>& parameters,
                           std::shared_ptr<QueryResult>& result) {
  SQL_LOG_TRACE_STREAM("TvpStatement::Execute - Starting execution with " << parameters.size()
                                                                          << " parameters");

  state_ = State::STMT_EXECUTING;

  // Set the statement handle on the result
  result->setHandle(this->GetStatementHandle());

  // TVP-specific execution logic would go here
  // For now, we'll just implement a basic version to satisfy the interface

  // Convert query to wide string
  auto wideQuery = StringUtils::Utf8ToUtf16(query_);

  // Make sure it's null-terminated
  if (wideQuery->size() > 0 && (*wideQuery)[wideQuery->size() - 1] != L'\0') {
    wideQuery->push_back(L'\0');
  }

  // Execute directly
  auto ret = odbcApi_->SQLExecDirectW(
      statement_->get_handle(), reinterpret_cast<SQLWCHAR*>(wideQuery->data()), SQL_NTS);

  if (!errorHandler_->CheckOdbcError(ret)) {
    SQL_LOG_ERROR_STREAM("TVP statement execution failed");
    state_ = State::STMT_ERROR;
    return false;
  }

  SQL_LOG_TRACE("TVP statement executed successfully");
  hasMoreResults_ = true;
  endOfRows_ = false;

  // Process results
  return true;
}
}  // namespace mssql