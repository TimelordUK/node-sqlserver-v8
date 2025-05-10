#include "platform.h"
#include "odbc_common.h"
#include "iodbc_api.h"
#include "odbc_statement.h"
#include "odbc_error_handler.h"
#include "string_utils.h"
#include <Logger.h>

namespace mssql
{
  bool TvpStatement::BindTvpColumns(const std::vector<std::string> &columnNames)
  {
    SQL_LOG_TRACE_STREAM("TvpStatement::BindTvpColumns - Binding "
                         << columnNames.size() << " columns");

    if (isColumnsBound_)
    {
      SQL_LOG_TRACE("Columns already bound");
      return true;
    }

    // TVP specific implementation goes here
    // This is a placeholder implementation
    isColumnsBound_ = true;
    return true;
  }

  bool TvpStatement::Execute(
      const std::vector<std::shared_ptr<QueryParameter>> &parameters,
      std::shared_ptr<QueryResult> &result)
  {
    SQL_LOG_TRACE_STREAM("TvpStatement::Execute - Starting execution with "
                         << parameters.size() << " parameters");

    state_ = State::STMT_EXECUTING;

    // Set the statement handle on the result
    result->setHandle(this->GetStatementHandle());

    // TVP-specific execution logic would go here
    // For now, we'll just implement a basic version to satisfy the interface

    // Convert query to wide string
    auto wideQuery = StringUtils::Utf8ToUtf16(query_);

    // Make sure it's null-terminated
    if (wideQuery->size() > 0 && (*wideQuery)[wideQuery->size() - 1] != L'\0')
    {
      wideQuery->push_back(L'\0');
    }

    // Execute directly
    auto ret = odbcApi_->SQLExecDirectW(
        statement_->get_handle(),
        reinterpret_cast<SQLWCHAR *>(wideQuery->data()),
        SQL_NTS);

    if (!errorHandler_->CheckOdbcError(ret))
    {
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

  bool TvpStatement::FetchNextBatch(size_t batchSize)
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

  bool TvpStatement::NextResultSet()
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
}