#pragma once
#include <memory>

#include "odbc_error.h"
#include "odbc_handles.h"

namespace mssql {

class OdbcTransactionManager {
 public:
  explicit OdbcTransactionManager(std::shared_ptr<ConnectionHandles> connectionHandles,
                                  std::shared_ptr<IOdbcApi> odbcApi);

  bool BeginTransaction();
  bool CommitTransaction();
  bool RollbackTransaction();
  
  std::shared_ptr<std::vector<std::shared_ptr<OdbcError>>> GetErrors() const { return _errors; }

 private:
  bool try_begin_tran();
  bool try_end_tran(SQLSMALLINT completion_type);
  bool CheckOdbcError(SQLRETURN ret);

  std::shared_ptr<ConnectionHandles> _connectionHandles;
  std::shared_ptr<std::vector<std::shared_ptr<OdbcError>>> _errors;
  std::shared_ptr<IOdbcApi> _odbcApi;
};

}  // namespace mssql