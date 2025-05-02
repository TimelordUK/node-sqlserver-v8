#include "odbc_query_executor.h"
#include "platform.h"
#include "string_utils.h"
#include <Logger.h>

namespace mssql
{

  OdbcQueryExecutor::OdbcQueryExecutor(
      std::shared_ptr<ConnectionHandles> connectionHandles,
      std::shared_ptr<OdbcErrorHandler> errorHandler)
      : _connectionHandles(connectionHandles),
        _errorHandler(errorHandler)
  {
  }

  bool OdbcQueryExecutor::ExecuteQuery(
      const std::string &sqlText,
      const std::vector<std::shared_ptr<QueryParameter>> &parameters,
      std::shared_ptr<QueryResult> &result)
  {

    SQL_LOG_INFO("Executing query");
    SQL_LOG_DEBUG_STREAM("SQL: " << sqlText);
    SQL_LOG_DEBUG_STREAM("Parameter count: " << parameters.size());

    // Create a statement using our factory method
    auto stmt = create_statement_handle();
    if (!stmt->alloc(_connectionHandles->connectionHandle()->get_handle()))
    {
      SQL_LOG_ERROR("unable to allocate statement handle");
      return _errorHandler->ReturnOdbcError();
    }

    // Prepare the statement
    auto wideQuery = ConvertToWideString(sqlText);
    auto ret = SQLPrepare(stmt->get_handle(),
                          reinterpret_cast<SQLWCHAR *>(wideQuery->data()),
                          static_cast<SQLINTEGER>(wideQuery->size()));

    if (!_errorHandler->CheckOdbcError(ret))
    {
      SQL_LOG_ERROR("SQLPrepare failed");
      return false;
    }

    // Bind parameters
    if (!BindParameters(stmt.get(), parameters))
    {
      return false;
    }

    // Execute the query
    ret = SQLExecute(stmt->get_handle());
    if (!_errorHandler->CheckOdbcError(ret))
    {
      SQL_LOG_ERROR("SQLExecute failed");
      return false;
    }

    // Process results
    return ProcessResults(stmt.get(), result);
  }

  std::shared_ptr<std::vector<uint16_t>> OdbcQueryExecutor::ConvertToWideString(
      const std::string &text)
  {
    return StringUtils::Utf8ToUtf16(text);
  }

  bool OdbcQueryExecutor::BindParameters(
      IOdbcStatementHandle *stmt,
      const std::vector<std::shared_ptr<QueryParameter>> &parameters)
  {

    for (size_t i = 0; i < parameters.size(); i++)
    {
      // TODO: Implement parameter binding based on type
      // This would be complex and depend on your parameter handling
    }
    return true;
  }

  bool OdbcQueryExecutor::ProcessResults(
      IOdbcStatementHandle *stmt,
      std::shared_ptr<QueryResult> &result)
  {

    // Get column information
    SQLSMALLINT numCols = 0;
    SQLNumResultCols(stmt->get_handle(), &numCols);

    // For each column, get name and type
    for (SQLSMALLINT i = 1; i <= numCols; i++)
    {
      SQLWCHAR colName[256];
      SQLSMALLINT colNameLen;
      SQLSMALLINT dataType;

      SQLDescribeCol(stmt->get_handle(), i, colName, sizeof(colName) / sizeof(SQLWCHAR),
                     &colNameLen, &dataType, NULL, NULL, NULL);

      // Convert to string using your conversion utilities
      std::string colNameStr = odbcstr::swcvec2str(
          std::vector<SQLWCHAR>(colName, colName + colNameLen),
          colNameLen);

      result->addColumn(colNameStr, dataType);
    }

    // Fetch rows
    while (SQL_SUCCEEDED(SQLFetch(stmt->get_handle())))
    {
      std::vector<std::string> rowData;

      for (SQLSMALLINT i = 1; i <= numCols; i++)
      {
        SQLWCHAR buffer[4096];
        SQLLEN indicator;

        auto ret = SQLGetData(stmt->get_handle(), i, SQL_C_WCHAR, buffer, sizeof(buffer), &indicator);

        if (SQL_SUCCEEDED(ret))
        {
          if (indicator == SQL_NULL_DATA)
          {
            rowData.emplace_back("NULL");
          }
          else
          {
            // Convert to string
            std::string value = odbcstr::swcvec2str(
                std::vector<SQLWCHAR>(buffer, buffer + (indicator / sizeof(SQLWCHAR))),
                indicator / sizeof(SQLWCHAR));
            rowData.push_back(value);
          }
        }
        else
        {
          rowData.emplace_back("ERROR");
        }
      }

      result->addRow(rowData);
    }
    return true;
  }

} // namespace mssql