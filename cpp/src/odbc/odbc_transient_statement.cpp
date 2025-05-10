#include "platform.h"
#include "common/odbc_common.h"
#include "odbc/iodbc_api.h"
#include "odbc/odbc_statement.h"
#include "odbc/odbc_error_handler.h"
#include "common/string_utils.h"
#include <Logger.h>

namespace mssql
{

  bool TransientStatement::Execute(
      const std::vector<std::shared_ptr<QueryParameter>> &parameters,
      std::shared_ptr<QueryResult> &result)
  {
    SQL_LOG_TRACE_STREAM("TransientStatement::Execute - Starting execution with "
                         << parameters.size() << " parameters");
    state_ = State::STMT_EXECUTING;

    // Convert query to wide string
    auto wideQuery = StringUtils::Utf8ToUtf16(query_);

    result->setHandle(this->GetStatementHandle());

    // Make sure it's null-terminated
    if (wideQuery->size() > 0 && (*wideQuery)[wideQuery->size() - 1] != L'\0')
    {
      wideQuery->push_back(L'\0');
    }

    // Log only a reasonable portion of the query to avoid garbage in logs
    std::string queryForLog = StringUtils::SafeWideToUtf8ForLogging(
        reinterpret_cast<SQLWCHAR *>(wideQuery->data()));
    SQL_LOG_TRACE_STREAM("Query for execution: " << queryForLog);

    // Execute directly using SQL_NTS to indicate null-terminated string
    SQL_LOG_TRACE_STREAM("Executing SQLExecDirectW on statement handle: " << statement_->get_handle());
    auto ret = odbcApi_->SQLExecDirectW(
        statement_->get_handle(),
        reinterpret_cast<SQLWCHAR *>(wideQuery->data()),
        SQL_NTS); // Use SQL_NTS instead of length

    if (!errorHandler_->CheckOdbcError(ret))
    {
      SQL_LOG_ERROR_STREAM("Statement execution failed with return code: "
                           << GetSqlReturnCodeString(ret));
      state_ = State::STMT_ERROR;
      return false;
    }

    SQL_LOG_TRACE("Statement execution successful");
    hasMoreResults_ = true;
    endOfRows_ = false;

    // Get metadata for first result set
    return GetMetadata(result);
  }

  bool TransientStatement::GetMetadata(std::shared_ptr<QueryResult> &result)
  {
    SQL_LOG_TRACE_STREAM("TransientStatement::GetMetadata - hasMoreResults: " << hasMoreResults_);

    if (!hasMoreResults_)
    {
      SQL_LOG_DEBUG("No more results available");
      return false;
    }

    state_ = State::STMT_METADATA_READY;
    SQL_LOG_TRACE("Getting metadata for result set");
    auto res = InitializeResultSet(result);
    this->metaData_ = result;
    return res;
  }

  bool TransientStatement::InitializeResultSet(std::shared_ptr<QueryResult> &result)
  {
    // Get column information
    SQLSMALLINT numCols = 0;
    auto ret = odbcApi_->SQLNumResultCols(statement_->get_handle(), &numCols);
    if (!errorHandler_->CheckOdbcError(ret))
    {
      state_ = State::STMT_ERROR;
      return false;
    }

    // If no columns, this is not a result set
    if (numCols == 0)
    {
      hasMoreResults_ = false;
      endOfRows_ = true;
      state_ = State::STMT_NO_MORE_RESULTS;
      return true;
    }

    // For each column, get name and type
    for (SQLSMALLINT i = 1; i <= numCols; i++)
    {
      // Create a column definition
      ColumnDefinition colDef;
      colDef.colNameLen = 0;

      // Let ODBC write directly to our struct members
      ret = SQLDescribeCol(
          statement_->get_handle(),
          i,
          colDef.colName,
          sizeof(colDef.colName) / sizeof(SQLWCHAR),
          &colDef.colNameLen,
          &colDef.dataType,
          &colDef.columnSize,
          &colDef.decimalDigits,
          &colDef.nullable);

      if (!errorHandler_->CheckOdbcError(ret))
      {
        state_ = State::STMT_ERROR;
        return false;
      }

      // Add the column definition directly to the result
      result->addColumn(colDef);
    }

    return true;
  }

  bool TransientStatement::FetchNextBatch(size_t batchSize)
  {
    if (state_ != State::STMT_METADATA_READY && state_ != State::STMT_FETCHING_ROWS)
    {
      return false;
    }

    state_ = State::STMT_FETCHING_ROWS;

    // Set up row array size
    SQLULEN rowsFetched = 0;
    auto ret = odbcApi_->SQLSetStmtAttr(
        statement_->get_handle(),
        SQL_ATTR_ROWS_FETCHED_PTR,
        &rowsFetched,
        0);

    if (!errorHandler_->CheckOdbcError(ret))
    {
      state_ = State::STMT_ERROR;
      return false;
    }

    // Fetch the rows
    ret = odbcApi_->SQLFetchScroll(
        statement_->get_handle(),
        SQL_FETCH_NEXT,
        0);

    if (ret == SQL_NO_DATA)
    {
      endOfRows_ = true;
      state_ = State::STMT_FETCH_COMPLETE;
      return true;
    }

    if (!errorHandler_->CheckOdbcError(ret))
    {
      state_ = State::STMT_ERROR;
      return false;
    }

    return true;
  }

  bool TransientStatement::NextResultSet()
  {
    if (!hasMoreResults_ || state_ != State::STMT_FETCH_COMPLETE)
    {
      return false;
    }

    auto ret = odbcApi_->SQLMoreResults(statement_->get_handle());

    if (ret == SQL_NO_DATA)
    {
      hasMoreResults_ = false;
      state_ = State::STMT_NO_MORE_RESULTS;
      return false;
    }

    if (!errorHandler_->CheckOdbcError(ret))
    {
      state_ = State::STMT_ERROR;
      return false;
    }

    endOfRows_ = false;
    state_ = State::STMT_METADATA_READY;
    return true;
  }

  // The HasMoreResults, EndOfRows, and GetState methods are inherited from OdbcStatement

}