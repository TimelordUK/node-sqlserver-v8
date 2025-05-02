#pragma once
#include <memory>
#include <string>
#include <vector>
#include "odbc_handles.h"
#include "odbc_error_handler.h"
#include "query_parameter.h"
#include "query_result.h"

namespace mssql
{

  class OdbcQueryExecutor
  {
  public:
    OdbcQueryExecutor(std::shared_ptr<ConnectionHandles> connectionHandles,
                      std::shared_ptr<OdbcErrorHandler> errorHandler);

    bool ExecuteQuery(const std::string &sqlText,
                      const std::vector<std::shared_ptr<QueryParameter>> &parameters,
                      std::shared_ptr<QueryResult> &result);

  private:
    std::shared_ptr<std::vector<uint16_t>> ConvertToWideString(const std::string &text);
    bool BindParameters(IOdbcStatementHandle *stmt,
                        const std::vector<std::shared_ptr<QueryParameter>> &parameters);
    bool ProcessResults(IOdbcStatementHandle *stmt, std::shared_ptr<QueryResult> &result);

    std::shared_ptr<ConnectionHandles> _connectionHandles;
    std::shared_ptr<OdbcErrorHandler> _errorHandler;
  };

} // namespace mssql