#pragma once

#include <memory>
#include <map>
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
    std::shared_ptr<OdbcStatement> MakeStatement(
        std::shared_ptr<IOdbcApi> odbcApi,
        OdbcStatement::Type type,
        std::shared_ptr<IOdbcStatementHandle> handle,
        std::shared_ptr<OdbcErrorHandler> errorHandler,
        const std::string &query,
        const std::string &tvpType = "");

    void RemoveStatement(int statementId);
    std::shared_ptr<OdbcStatement> GetStatement(int statementId);

  private:
    IdFactory factory_;
    int connectionId_;
    std::map<int, std::shared_ptr<OdbcStatement>> statements_;
  };

} // namespace mssql