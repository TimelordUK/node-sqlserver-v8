#include "odbc/connection_handles.h"

#include <common/odbc_common.h>

#include <algorithm>
#include <functional>
#include <vector>

#include "odbc/odbc_handles.h"
#include "platform.h"
#include "utils/Logger.h"

namespace mssql {
ConnectionHandles::ConnectionHandles(std::shared_ptr<IOdbcEnvironmentHandle> env)
    : envHandle_(env), connectionHandle_(create_connection_handle()) {
  connectionHandle_->alloc(env->get_handle());
}

ConnectionHandles::~ConnectionHandles() {
  SQL_LOG_DEBUG_STREAM("ConnectionHandles::~ConnectionHandles - free connection handle");
  clear();
  connectionHandle_->free();
  connectionHandle_ = nullptr;
}

void ConnectionHandles::clear() {
  SQL_LOG_DEBUG_STREAM("ConnectionHandles::clear - size = " << _statementHandles.size());
  std::vector<long> ids;

  std::for_each(_statementHandles.begin(), _statementHandles.end(), [&](const auto& p) {
    const shared_ptr<IOdbcStatementHandle> s = p.second;
    s->free();
    ids.insert(ids.begin(), p.first);
  });

  for_each(ids.begin(), ids.end(), [&](const long id) {
    SQL_LOG_DEBUG_STREAM("destruct OdbcStatementCache - erase statement");
    _statementHandles.erase(id);
  });
}

// Return the interface pointer
std::shared_ptr<IOdbcConnectionHandle> ConnectionHandles::connectionHandle() {
  return connectionHandle_;
}
}  // namespace mssql