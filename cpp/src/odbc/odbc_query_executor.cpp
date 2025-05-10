#include "platform.h"
#include "odbc_query_executor.h"
#include "string_utils.h"
#include "odbc_statement_factory.h"
#include "iodbc_api.h"
#include <Logger.h>
#include "column_buffer.h"
#include "result_buffer.h"
#include "odbc_driver_types.h"

namespace mssql
{

  OdbcQueryExecutor::OdbcQueryExecutor(std::shared_ptr<IOdbcApi> api,
                                       std::shared_ptr<ConnectionHandles> connectionHandles,
                                       std::shared_ptr<OdbcErrorHandler> errorHandler)
      : _api(api),
        _connectionHandles(connectionHandles),
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
    auto stmt = OdbcStatementHandleFactory::createStatement();
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
      const auto &param = parameters[i];
      auto ret = param->bind(stmt->get_handle(), _api);

      if (!_errorHandler->CheckOdbcError(ret))
      {
        SQL_LOG_ERROR("Parameter binding failed");
        return false;
      }
    }
    return true;
  }

  bool OdbcQueryExecutor::ProcessResults(
      IOdbcStatementHandle *stmt,
      std::shared_ptr<QueryResult> &result)
  {
    // Get column information
    SQLSMALLINT numCols = 0;
    auto ret = SQLNumResultCols(stmt->get_handle(), &numCols);
    if (!_errorHandler->CheckOdbcError(ret))
    {
      SQL_LOG_ERROR("SQLNumResultCols failed");
      return false;
    }

    // For each column, get name and type
    for (SQLSMALLINT i = 1; i <= numCols; i++)
    {
      // Create a column definition
      ColumnDefinition colDef;
      colDef.colNameLen = 0;

      // Let ODBC write directly to our struct members
      ret = SQLDescribeCol(
          stmt->get_handle(),
          i,
          colDef.colName,
          sizeof(colDef.colName) / sizeof(SQLWCHAR),
          &colDef.colNameLen,
          &colDef.dataType,
          &colDef.columnSize,
          &colDef.decimalDigits,
          &colDef.nullable);

      if (!_errorHandler->CheckOdbcError(ret))
      {
        SQL_LOG_ERROR("SQLDescribeCol failed");
        return false;
      }

      // Add the column definition directly to the result
      result->addColumn(colDef);
    }

    return true;
  }

  // Helper method to map SQL types to DatumStorage types
  DatumStorage::SqlType OdbcQueryExecutor::MapSqlTypeToDatumType(SQLSMALLINT sqlType)
  {
    switch (sqlType)
    {
    case SQL_CHAR:
    case SQL_VARCHAR:
    case SQL_LONGVARCHAR:
      return DatumStorage::SqlType::VarChar;

    case SQL_WCHAR:
    case SQL_WVARCHAR:
    case SQL_WLONGVARCHAR:
      return DatumStorage::SqlType::NVarChar;

    case SQL_DECIMAL:
    case SQL_NUMERIC:
      return DatumStorage::SqlType::Decimal;

    case SQL_INTEGER:
      return DatumStorage::SqlType::Integer;

    case SQL_SMALLINT:
      return DatumStorage::SqlType::SmallInt;

    case SQL_FLOAT:
    case SQL_REAL:
    case SQL_DOUBLE:
      return DatumStorage::SqlType::Double;

    case SQL_BIT:
      return DatumStorage::SqlType::Bit;

    case SQL_TINYINT:
      return DatumStorage::SqlType::TinyInt;

    case SQL_BIGINT:
      return DatumStorage::SqlType::BigInt;

    case SQL_BINARY:
    case SQL_VARBINARY:
    case SQL_LONGVARBINARY:
      return DatumStorage::SqlType::Binary;

    case SQL_TYPE_DATE:
      return DatumStorage::SqlType::Date;

    case SQL_TYPE_TIME:
      return DatumStorage::SqlType::Time;

    case SQL_TYPE_TIMESTAMP:
      return DatumStorage::SqlType::DateTime;

    default:
      return DatumStorage::SqlType::VarChar;
    }
  }

  // Helper method to get column data into DatumStorage
  SQLRETURN OdbcQueryExecutor::GetColumnData(SQLHSTMT hStmt, SQLSMALLINT colNum,
                                             DatumStorage *storage, SQLLEN *indicator)
  {
    switch (storage->getType())
    {
    case DatumStorage::SqlType::Integer:
    {
      SQLINTEGER value;
      return SQLGetData(hStmt, colNum, SQL_C_SLONG, &value, sizeof(value), indicator);
    }

    case DatumStorage::SqlType::SmallInt:
    {
      SQLSMALLINT value;
      return SQLGetData(hStmt, colNum, SQL_C_SSHORT, &value, sizeof(value), indicator);
    }

    case DatumStorage::SqlType::TinyInt:
    {
      SQLCHAR value;
      return SQLGetData(hStmt, colNum, SQL_C_TINYINT, &value, sizeof(value), indicator);
    }

    case DatumStorage::SqlType::BigInt:
    {
      SQLBIGINT value;
      return SQLGetData(hStmt, colNum, SQL_C_SBIGINT, &value, sizeof(value), indicator);
    }

    case DatumStorage::SqlType::Double:
    {
      SQLDOUBLE value;
      return SQLGetData(hStmt, colNum, SQL_C_DOUBLE, &value, sizeof(value), indicator);
    }

    case DatumStorage::SqlType::Bit:
    {
      SQLCHAR value;
      return SQLGetData(hStmt, colNum, SQL_C_BIT, &value, sizeof(value), indicator);
    }

    case DatumStorage::SqlType::VarChar:
    case DatumStorage::SqlType::NVarChar:
    {
      SQLWCHAR buffer[4096];
      return SQLGetData(hStmt, colNum, SQL_C_WCHAR, buffer, sizeof(buffer), indicator);
    }

    case DatumStorage::SqlType::Binary:
    {
      SQLCHAR buffer[4096];
      return SQLGetData(hStmt, colNum, SQL_C_BINARY, buffer, sizeof(buffer), indicator);
    }

    case DatumStorage::SqlType::Date:
    {
      SQL_DATE_STRUCT value;
      return SQLGetData(hStmt, colNum, SQL_C_DATE, &value, sizeof(value), indicator);
    }

    case DatumStorage::SqlType::Time:
    {
      SQL_TIME_STRUCT value;
      return SQLGetData(hStmt, colNum, SQL_C_TIME, &value, sizeof(value), indicator);
    }

    case DatumStorage::SqlType::DateTime:
    {
      SQL_TIMESTAMP_STRUCT value;
      return SQLGetData(hStmt, colNum, SQL_C_TIMESTAMP, &value, sizeof(value), indicator);
    }

    default:
      // Default to string for unknown types
      SQLWCHAR buffer[4096];
      return SQLGetData(hStmt, colNum, SQL_C_WCHAR, buffer, sizeof(buffer), indicator);
    }
  }

} // namespace mssql