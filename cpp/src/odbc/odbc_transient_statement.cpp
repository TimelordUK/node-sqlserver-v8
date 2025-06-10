#include <platform.h>
#include <utils/Logger.h>

#include <common/odbc_common.h>
#include <common/string_utils.h>
#include <odbc/iodbc_api.h>
#include <odbc/odbc_error_handler.h>
#include <odbc/odbc_statement.h>

namespace mssql {

bool TransientStatement::Prepare(const std::shared_ptr<BoundDatumSet> parameters,
                                 std::shared_ptr<QueryResult>& result) {
  return true;
}

bool TransientStatement::BindExecute(const std::shared_ptr<BoundDatumSet> parameters,
                                     std::shared_ptr<QueryResult>& result) {
  return true;
}

bool TransientStatement::Execute(const std::shared_ptr<BoundDatumSet> parameters,
                                 std::shared_ptr<QueryResult>& result) {
  // SQL_LOG_TRACE_STREAM("TransientStatement::Execute - Starting execution with "
  //                     << parameters->size() << " parameters");
  state_ = State::STATEMENT_READING;

  // Convert query to wide string

  result->setHandle(this->GetStatementHandle());

  // Log only a reasonable portion of the query to avoid garbage in logs
  std::string queryForLog = StringUtils::SafeWideToUtf8ForLogging(
      reinterpret_cast<SQLWCHAR*>(operationParams_->query_string.data()));
  SQL_LOG_TRACE_STREAM("Query for execution: " << queryForLog);

  if (!bind_parameters(parameters)) {
    SQL_LOG_ERROR_STREAM("Failed to bind parameters");
    state_ = State::STATEMENT_ERROR;
    return false;
  }

  // Execute directly using SQL_NTS to indicate null-terminated string
  SQL_LOG_TRACE_STREAM(
      "Executing SQLExecDirectW on statement handle: " << statement_->get_handle());
  auto ret =
      odbcApi_->SQLExecDirectW(statement_->get_handle(),
                               reinterpret_cast<SQLWCHAR*>(operationParams_->query_string.data()),
                               SQL_NTS);  // Use SQL_NTS instead of length

  if (!errorHandler_->CheckOdbcError(ret)) {
    SQL_LOG_ERROR_STREAM(
        "Statement execution failed with return code: " << GetSqlReturnCodeString(ret));
    state_ = State::STATEMENT_ERROR;
    return false;
  }

  SQL_LOG_TRACE("Statement execution successful");
  hasMoreResults_ = true;
  endOfRows_ = false;

  // Get metadata for first result set
  return GetMetadata(result);
}

bool TransientStatement::GetMetadata(std::shared_ptr<QueryResult>& result) {
  SQL_LOG_TRACE_STREAM("TransientStatement::GetMetadata - hasMoreResults: " << hasMoreResults_);

  if (!hasMoreResults_) {
    SQL_LOG_DEBUG("No more results available");
    return false;
  }

  state_ = State::STATEMENT_BINDING;
  SQL_LOG_TRACE("Getting metadata for result set");
  auto res = InitializeResultSet(result);
  this->metaData_ = result;
  return res;
}

bool TransientStatement::InitializeResultSet(std::shared_ptr<QueryResult>& result) {
  // Get column information
  SQLSMALLINT numCols = 0;
  auto ret = odbcApi_->SQLNumResultCols(statement_->get_handle(), &numCols);
  if (!errorHandler_->CheckOdbcError(ret)) {
    state_ = State::STATEMENT_ERROR;
    return false;
  }
  SQL_LOG_TRACE_STREAM("TransientStatement::InitializeResultSet - numCols: " << numCols);
  // If no columns, this is not a result set
  if (numCols == 0) {
    hasMoreResults_ = false;
    endOfRows_ = true;
    result->set_end_of_rows(true);
    state_ = State::STATEMENT_READING;
    return true;
  }

  // For each column, get name and type
  for (SQLSMALLINT i = 1; i <= numCols; i++) {
    // Create a column definition
    ColumnDefinition colDef;
    colDef.colNameLen = 0;

    // Let ODBC write directly to our struct members
    ret = odbcApi_->SQLDescribeCol(statement_->get_handle(),
                                   i,
                                   colDef.name.data(),
                                   sizeof(colDef.name.size()) / sizeof(SQLWCHAR),
                                   &colDef.colNameLen,
                                   &colDef.dataType,
                                   &colDef.columnSize,
                                   &colDef.decimalDigits,
                                   &colDef.nullable);

    if (!errorHandler_->CheckOdbcError(ret)) {
      state_ = State::STATEMENT_ERROR;
      return false;
    }

    constexpr size_t l = 1024;
    vector<SQLWCHAR> type_name(l);
    SQLSMALLINT type_name_len = 0;
    auto ret = odbcApi_->SQLColAttribute(statement_->get_handle(),
                                         i,
                                         SQL_DESC_TYPE_NAME,
                                         type_name.data(),
                                         type_name.size() * sizeof(SQLWCHAR),
                                         &type_name_len,
                                         nullptr);
    if (!errorHandler_->CheckOdbcError(ret)) {
      state_ = State::STATEMENT_ERROR;
      return false;
    }

    // type_name_len is in bytes, convert to character count
    SQLSMALLINT char_len = type_name_len / sizeof(SQLWCHAR);
    colDef.dataTypeName = StringUtils::WideToUtf8(type_name.data(), char_len);

    // Add the column definition directly to the result
    result->addColumn(colDef);
  }

  return true;
}

bool TransientStatement::ReadNextResult(std::shared_ptr<QueryResult> result) {
  if (!statement_) {
    SQL_LOG_DEBUG_STREAM("TryReadNextResult ID  - statement handle not found");
    result->set_end_of_results(true);
    return false;
  }

  const auto& handle = *statement_;

  const auto statementHandle = GetStatementHandle();
  const auto statementId = statementHandle.getStatementId();
  const auto ret = odbcApi_->SQLMoreResults(handle.get_handle());
  switch (ret) {
    case SQL_NO_DATA: {
      SQL_LOG_DEBUG_STREAM("ReadNextResult ID = " << statementId << " - SQL_NO_DATA");
      result->set_end_of_rows(true);
      result->set_end_of_results(true);
      return true;
    }

    case SQL_SUCCESS_WITH_INFO: {
      if (!check_odbc_error(ret)) {
        return false;
      }
      const auto res = GetMetadata(result);
      if (res) {
        result->set_end_of_rows(false);
      } else {
        result->set_end_of_rows(true);
      }
      return false;
    }
    default:;
  }
  result->set_end_of_results(false);
  return GetMetadata(result);
}
}  // namespace mssql