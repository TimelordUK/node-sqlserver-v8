#pragma once
#include <memory>
#include "odbc_handles.h"
#include "odbc_error.h"

namespace mssql
{

  class OdbcTransactionManager
  {
  public:
    explicit OdbcTransactionManager(std::shared_ptr<ConnectionHandles> connectionHandles);

    bool BeginTransaction();
    bool CommitTransaction();
    bool RollbackTransaction();

  private:
    bool try_begin_tran();
    bool try_end_tran(SQLSMALLINT completion_type);
    bool CheckOdbcError(SQLRETURN ret);

    std::shared_ptr<ConnectionHandles> _connectionHandles;
    std::shared_ptr<std::vector<std::shared_ptr<OdbcError>>> _errors;
  };

} // namespace mssql