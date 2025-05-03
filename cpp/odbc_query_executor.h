#pragma once

// Standard library includes
#include <memory>
#include <string>
#include <vector>

// ODBC headers
#include <sql.h>
#include <sqlext.h>

// Project includes
#include "odbc_handles.h"
#include "odbc_error_handler.h"
#include "query_parameter.h"
#include "query_result.h"
#include "datum_storage.h"
#include "string_utils.h"

namespace mssql
{
  // Forward declarations
  class IOdbcStatementHandle;
  class IOdbcApi;

  class OdbcQueryExecutor
  {
  public:
    OdbcQueryExecutor(std::shared_ptr<IOdbcApi> api,
        std::shared_ptr<ConnectionHandles> connectionHandles,
        std::shared_ptr<OdbcErrorHandler> errorHandler);

    bool ExecuteQuery(const std::string &sqlText,
                      const std::vector<std::shared_ptr<QueryParameter>> &parameters,
                      std::shared_ptr<QueryResult> &result);

  private:
    std::shared_ptr<std::vector<uint16_t>> ConvertToWideString(const std::string &text);
    bool BindParameters(IOdbcStatementHandle *stmt,
                        const std::vector<std::shared_ptr<QueryParameter>> &parameters);
    bool ProcessResults(IOdbcStatementHandle *stmt, std::shared_ptr<QueryResult> &result);
    DatumStorage::SqlType MapSqlTypeToDatumType(SQLSMALLINT sqlType);
    SQLRETURN GetColumnData(SQLHSTMT hStmt, SQLSMALLINT colNum,
                            DatumStorage *storage, SQLLEN *indicator);

    std::shared_ptr<ConnectionHandles> _connectionHandles;
    std::shared_ptr<OdbcErrorHandler> _errorHandler;
    std::shared_ptr<IOdbcApi> _api;
  };

} // namespace mssql