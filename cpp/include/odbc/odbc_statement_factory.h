#pragma once

#include <map>
#include <memory>

#include "common/id_factory.h"
#include "odbc/odbc_driver_types.h"
#include "odbc/odbc_handles.h"
#include "odbc/odbc_statement.h"

namespace mssql {
class IOdbcStatementHandle;

class OdbcStatementHandleFactory {
 public:
  static std::shared_ptr<IOdbcStatementHandle> createStatement();
};

/**
 * @brief Factory for creating statements
 */
class OdbcStatementFactory {
 public:
  OdbcStatementFactory(int connectionId) : connectionId_(connectionId) {}

  std::shared_ptr<IOdbcStatement> CreateStatement(std::shared_ptr<IOdbcApi> odbcApi,
                                                  StatementType type,
                                                  std::shared_ptr<IOdbcStatementHandle> handle,
                                                  std::shared_ptr<OdbcErrorHandler> errorHandler,
                                                  const std::string& query,
                                                  const std::string& tvpType = "");
  IdFactory factory_;
  int connectionId_;
  std::map<int, std::shared_ptr<IOdbcStatement>> statements_;

  void RemoveStatement(int statementId);

  std::shared_ptr<IOdbcStatement> GetStatement(int statementId);

 private:
  std::shared_ptr<IOdbcStatement> MakeStatement(std::shared_ptr<IOdbcApi> odbcApi,
                                                OdbcStatement::Type type,
                                                std::shared_ptr<IOdbcStatementHandle> handle,
                                                std::shared_ptr<OdbcErrorHandler> errorHandler,
                                                const std::string& query,
                                                const std::string& tvpType = "");
};

}  // namespace mssql