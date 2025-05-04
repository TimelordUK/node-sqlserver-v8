#pragma once

#include <memory>
#include "odbc_handles.h"
#include "id_factory.h"
#include "odbc_driver_types.h"
#include "odbc_statement.h"

namespace mssql
{
  class IOdbcStatementHandle;

  class OdbcStatementHandleFactory
  {
  public:
    static std::shared_ptr<IOdbcStatementHandle> createStatement();
  };

  /**
   * @brief Factory for creating statements
   */
  class OdbcStatementFactory
  {
  public:
    OdbcStatementFactory(int connectionId) : connectionId_(connectionId)
    {
    }
    std::shared_ptr<OdbcStatement> CreateStatement(
        std::shared_ptr<IOdbcApi> odbcApi,
        OdbcStatement::Type type,
        std::shared_ptr<IOdbcStatementHandle> handle,
        std::shared_ptr<OdbcErrorHandler> errorHandler,
        const std::string &query,
        const std::string &tvpType = "");

  private:
    IdFactory factory_;
    int connectionId_;
  };

} // namespace mssql