#include "platform.h"
#include "odbc_common.h"
#include "iodbc_api.h"
#include "odbc_statement.h"
#include "odbc_error_handler.h"
#include "string_utils.h"
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

    result->setHandle(this->getStatementHandle());

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
    return InitializeResultSet(result);
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

  bool TransientStatement::HasMoreResults() const { return hasMoreResults_; }

  bool TransientStatement::EndOfRows() const { return endOfRows_; }

  OdbcStatement::State TransientStatement::GetState() const { return state_; }

  bool PreparedStatement::Prepare()
  {
    if (isPrepared_)
    {
      return true;
    }

    SQL_LOG_DEBUG("Preparing statement");

    // Convert query to wide string
    auto wideQuery = StringUtils::Utf8ToUtf16(query_);

    // Prepare the statement - use the API interface
    auto ret = odbcApi_->SQLPrepareW(
        statement_->get_handle(),
        reinterpret_cast<SQLWCHAR *>(wideQuery->data()),
        static_cast<SQLINTEGER>(wideQuery->size()));

    if (!errorHandler_->CheckOdbcError(ret))
    {
      SQL_LOG_ERROR("SQLPrepare failed");
      return false;
    }

    isPrepared_ = true;
    return true;
  }

  bool PreparedStatement::Execute(
      const std::vector<std::shared_ptr<QueryParameter>> &parameters,
      std::shared_ptr<QueryResult> &result)
  {
    if (!isPrepared_ && !Prepare())
    {
      return false;
    }

    SQL_LOG_DEBUG("Executing prepared statement");

    // Bind parameters
    for (const auto &param : parameters)
    {
      auto ret = param->bind(statement_->get_handle(), odbcApi_);
      if (!errorHandler_->CheckOdbcError(ret))
      {
        SQL_LOG_ERROR("Parameter binding failed");
        return false;
      }
    }

    // Execute
    auto ret = odbcApi_->SQLExecute(statement_->get_handle());
    if (!errorHandler_->CheckOdbcError(ret))
    {
      SQL_LOG_ERROR("SQLExecute failed");
      return errorHandler_->ReturnOdbcError(); // Add this call
    }

    // Process results
    return ProcessResults(result);
  }

  bool TvpStatement::BindTvpColumns(const std::vector<std::string> &columnNames)
  {
    if (isColumnsBound_)
    {
      return true;
    }

    SQL_LOG_DEBUG("Binding TVP columns");

    // TODO: Implement TVP column binding
    // This will require:
    // 1. Setting up the TVP type
    // 2. Binding columns using SQLSetDescField
    // 3. Setting up parameter binding for the TVP

    isColumnsBound_ = true;
    return true;
  }

  bool TvpStatement::Execute(
      const std::vector<std::shared_ptr<QueryParameter>> &parameters,
      std::shared_ptr<QueryResult> &result)
  {
    if (!isColumnsBound_)
    {
      SQL_LOG_ERROR("TVP columns not bound");
      return false;
    }

    SQL_LOG_DEBUG("Executing TVP statement");

    // TODO: Implement TVP execution
    // This will require:
    // 1. Binding the TVP parameter
    // 2. Setting up row-wise binding
    // 3. Executing the statement with SQLExecute

    return false; // Not implemented yet
  }

  // Base class implementation of ProcessResults
  bool OdbcStatement::ProcessResults(std::shared_ptr<QueryResult> &result)
  {
    // Get column information
    SQLSMALLINT numCols = 0;
    auto ret = odbcApi_->SQLNumResultCols(statement_->get_handle(), &numCols);
    if (!errorHandler_->CheckOdbcError(ret))
    {
      SQL_LOG_ERROR("SQLNumResultCols failed");
      return false;
    }

    // If no columns, no need to process further - this is not an error
    if (numCols == 0)
    {
      SQL_LOG_DEBUG("No columns in result set");
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
        // state_ = State::STMT_ERROR;
        return false;
      }

      // Add the column definition directly to the result
      result->addColumn(colDef);
    }

    // Fetch rows
    while (true)
    {
      ret = odbcApi_->SQLFetch(statement_->get_handle());
      if (ret == SQL_NO_DATA)
      {
        break;
      }
      if (!errorHandler_->CheckOdbcError(ret))
      {
        SQL_LOG_ERROR("SQLFetch failed");
        return false;
      }
      // Process row data
      std::vector<std::string> rowData;
      for (SQLSMALLINT i = 1; i <= numCols; i++)
      {
        SQLWCHAR buffer[4096];
        SQLLEN indicator;
        ret = odbcApi_->SQLGetData(
            statement_->get_handle(),
            i,
            SQL_C_WCHAR,
            buffer,
            sizeof(buffer),
            &indicator);
        if (!errorHandler_->CheckOdbcError(ret))
        {
          SQL_LOG_ERROR("SQLGetData failed");
          return false;
        }
        if (indicator == SQL_NULL_DATA)
        {
          rowData.push_back("NULL");
        }
        else
        {
          rowData.push_back(StringUtils::WideToUtf8(buffer, static_cast<SQLSMALLINT>(indicator / sizeof(SQLWCHAR))));
        }
      }
      // result->addRow(rowData);
    }
    return true;
  }


}