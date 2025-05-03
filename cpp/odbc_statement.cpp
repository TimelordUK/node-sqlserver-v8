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
      const std::vector<std::shared_ptr<QueryParameter>>& parameters,
      std::shared_ptr<QueryResult>& result)
  {
      SQL_LOG_DEBUG("Executing transient statement");

      // Convert query to wide string
      auto wideQuery = StringUtils::Utf8ToUtf16(query_);

      // Prepare the statement
      auto ret = odbcApi_->SQLPrepare(
          statement_->get_handle(),
          reinterpret_cast<SQLWCHAR*>(wideQuery->data()),
          static_cast<SQLINTEGER>(wideQuery->size()));

      if (!errorHandler_->CheckOdbcError(ret))
      {
          SQL_LOG_ERROR("SQLPrepare failed");
          return false;
      }

      // Bind parameters
      for (const auto& param : parameters)
      {
          ret = param->bind(statement_->get_handle(), odbcApi_); // Pass odbcApi to bind
          if (!errorHandler_->CheckOdbcError(ret))
          {
              SQL_LOG_ERROR("Parameter binding failed");
              return false;
          }
      }

      // Execute
      ret = odbcApi_->SQLExecute(statement_->get_handle());
      if (!errorHandler_->CheckOdbcError(ret))
      {
          SQL_LOG_ERROR("SQLExecute failed");
          return false;
      }

      // Process results
      return ProcessResults(result);
  }


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
          reinterpret_cast<SQLWCHAR*>(wideQuery->data()),
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
  bool OdbcStatement::ProcessResults(std::shared_ptr<QueryResult>& result)
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
          SQLWCHAR colName[256];
          SQLSMALLINT colNameLen;
          SQLSMALLINT dataType;
          SQLULEN columnSize;
          SQLSMALLINT decimalDigits;
          SQLSMALLINT nullable;
          ret = odbcApi_->SQLDescribeColW(  // Use SQLDescribeColW to match interface
              statement_->get_handle(),
              i,
              colName,
              sizeof(colName) / sizeof(SQLWCHAR),
              &colNameLen,
              &dataType,
              &columnSize,
              &decimalDigits,
              &nullable);
          if (!errorHandler_->CheckOdbcError(ret))
          {
              SQL_LOG_ERROR("SQLDescribeCol failed");
              return false;
          }
          // Convert column name to string
          std::string colNameStr = StringUtils::WideToUtf8(colName, colNameLen);
          result->addColumn(colNameStr, dataType);
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
          result->addRow(rowData);
      }
      return true;
  }

  // StatementFactory implementation
  std::shared_ptr<OdbcStatement> StatementFactory::CreateStatement(
      std::shared_ptr<IOdbcApi> odbcApi,
      OdbcStatement::Type type,
      std::shared_ptr<IOdbcStatementHandle> handle,
      std::shared_ptr<OdbcErrorHandler> errorHandler,
      const std::string &query,
      const std::string &tvpType)
  {
    switch (type)
    {
    case OdbcStatement::Type::Transient:
      return std::make_shared<TransientStatement>(
          handle, errorHandler, query, odbcApi);

    case OdbcStatement::Type::Prepared:
      return std::make_shared<PreparedStatement>(
          handle, errorHandler, query, odbcApi);

    case OdbcStatement::Type::TVP:
      return std::make_shared<TvpStatement>(
          handle, errorHandler, query, tvpType,odbcApi);

    default:
      return nullptr;
    }
  }
}