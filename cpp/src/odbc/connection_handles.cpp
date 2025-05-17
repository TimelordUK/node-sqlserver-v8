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
  
  // Direct iteration - no need for intermediate vector
  for (const auto& [id, handle] : _statementHandles) {
    SQL_LOG_DEBUG_STREAM("destruct OdbcStatementCache - free statement " << id);
    handle->free();
  }
  
  _statementHandles.clear();
}

shared_ptr<IOdbcStatementHandle> ConnectionHandles::find(const long statement_id) {
  shared_ptr<IOdbcStatementHandle> statement_handle = nullptr;
  const auto itr = _statementHandles.find(statement_id);
  if (itr != _statementHandles.end()) {
    statement_handle = itr->second;
  }
  return statement_handle;
}

size_t ConnectionHandles::size() const {
  return _statementHandles.size();
}

bool ConnectionHandles::exists(long statement_id) const {
  return _statementHandles.find(statement_id) != _statementHandles.end();
}

shared_ptr<IOdbcStatementHandle> ConnectionHandles::store(const long statement_id,
                                                          shared_ptr<IOdbcStatementHandle> handle) {
  SQL_LOG_DEBUG_STREAM("ConnectionHandles::store - statementId = " << statement_id);
  
  // Use try_emplace for atomic check-and-insert
  const auto [it, inserted] = _statementHandles.try_emplace(statement_id, handle);
  
  if (!inserted) {
    SQL_LOG_ERROR_STREAM(
        "ConnectionHandles::store - statementId already exists = " << statement_id);
    return nullptr;
  }
  
  return handle;
}

shared_ptr<IOdbcStatementHandle> ConnectionHandles::checkout(long statement_id) {
  if (statement_id < 0) {
    SQL_LOG_ERROR_STREAM("ConnectionHandles::checkout - invalid statementId = " << statement_id);
    return nullptr;
  }
  auto statement = find(statement_id);
  if (statement) {
    SQL_LOG_DEBUG_STREAM("ConnectionHandles::checkout ok on statementId = " << statement_id);
    return statement;
  }
  auto handle = create_statement_handle();
  handle->alloc(connectionHandle_->get_handle());
  SQL_LOG_DEBUG_STREAM(
      "ConnectionHandles::checkout - creating new handle for statementId = " << statement_id);
  return store(statement_id, handle);
}

void ConnectionHandles::checkin(long statementId) {
  SQL_LOG_DEBUG_STREAM("ConnectionHandles::checkin - statementId = " << statementId);
  const auto handle = find(statementId);
  if (handle == nullptr) {
    SQL_LOG_ERROR_STREAM(
        "ConnectionHandles::checkin - no handle found for statementId = " << statementId);
    return;
  }
  _statementHandles.erase(statementId);
  handle->free();
}

// Return the interface pointer
std::shared_ptr<IOdbcConnectionHandle> ConnectionHandles::connectionHandle() {
  return connectionHandle_;
}
}  // namespace mssql