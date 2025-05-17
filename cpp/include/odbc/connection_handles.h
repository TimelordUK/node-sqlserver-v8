#pragma once

#include "platform.h"
#include <common/odbc_common.h>
#include "odbc/odbc_handles.h"
#include <vector>
#include <set>
#include <map>
#include <memory>
#include <functional>

namespace mssql
{
  class ConnectionHandles
  {
  public:
    ConnectionHandles(std::shared_ptr<IOdbcEnvironmentHandle> env);
    ~ConnectionHandles();
    void clear();
    std::shared_ptr<IOdbcConnectionHandle> connectionHandle();
    std::shared_ptr<IOdbcStatementHandle> checkout(long statementId);
    void checkin(long statementId);

  private:
    shared_ptr<IOdbcStatementHandle> store(shared_ptr<IOdbcStatementHandle> handle);
    shared_ptr<IOdbcStatementHandle> find(const long statement_id);
    std::map<long, shared_ptr<IOdbcStatementHandle>> _statementHandles;
    std::shared_ptr<IOdbcEnvironmentHandle> envHandle_;
    std::shared_ptr<IOdbcConnectionHandle> connectionHandle_;
  };
}