#include <platform.h>
#include <common/odbc_common.h>
#include <utils/Logger.h>

#include <core/bound_datum_set.h>
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

bool TvpStatement::BindExecute(const std::shared_ptr<BoundDatumSet> parameters,
                               std::shared_ptr<QueryResult>& result) {
  return true;
}

bool TvpStatement::Prepare(const std::shared_ptr<BoundDatumSet> parameters,
                           std::shared_ptr<QueryResult>& result) {
  SQL_LOG_TRACE_STREAM("TvpStatement::Prepare - Starting preparation with " << parameters->size()
                                                                            << " parameters");
  return true;
}

bool TvpStatement::Execute(const std::shared_ptr<BoundDatumSet> parameters,
                           std::shared_ptr<QueryResult>& result) {
  SQL_LOG_TRACE_STREAM("TvpStatement::Execute - Starting execution with " << parameters->size()
                                                                          << " parameters");

  state_ = State::STATEMENT_READING;

  // Set the statement handle on the result
  result->setHandle(this->GetStatementHandle());

  // Execute directly
  auto ret =
      odbcApi_->SQLExecDirectW(statement_->get_handle(),
                               reinterpret_cast<SQLWCHAR*>(operationParams_->query_string.data()),
                               SQL_NTS);

  if (!errorHandler_->CheckOdbcError(ret)) {
    SQL_LOG_ERROR_STREAM("TVP statement execution failed");
    state_ = State::STATEMENT_ERROR;
    return false;
  }

  SQL_LOG_TRACE("TVP statement executed successfully");
  hasMoreResults_ = true;
  endOfRows_ = false;

  // Process results
  return true;
}

}  // namespace mssql