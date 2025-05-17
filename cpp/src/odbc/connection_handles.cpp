#include "odbc/connection_handles.h"

#include <common/odbc_common.h>

#include <algorithm>
#include <functional>
#include <string>
#include <vector>

#include "odbc/odbc_handles.h"
#include "odbc/safe_handle.h"
#include "platform.h"
#include "utils/Logger.h"

namespace mssql {
ConnectionHandles::ConnectionHandles(std::shared_ptr<IOdbcEnvironmentHandle> env)
    : envHandle_(nullptr),
      connectionHandle_(nullptr) {
  if (!env) {
    SQL_LOG_ERROR("ConnectionHandles constructor received null environment handle");
    return;
  }
  
  // The environment handle is already allocated, so we don't wrap it in SafeHandle
  // as it's managed externally
  envHandle_ = std::make_shared<SafeHandle<IOdbcEnvironmentHandle>>("Environment", env);
  
  // Mark the environment handle as already allocated since it comes pre-allocated
  envHandle_->markAsAllocated();
  
  // Create and allocate the connection handle
  auto connHandle = create_connection_handle();
  connectionHandle_ = std::make_shared<SafeHandle<IOdbcConnectionHandle>>("Connection", connHandle);
  
  if (!connectionHandle_->alloc(env->get_handle())) {
    SQL_LOG_ERROR("Failed to allocate connection handle");
  }
}

ConnectionHandles::~ConnectionHandles() {
  SQL_LOG_DEBUG_STREAM("ConnectionHandles::~ConnectionHandles - free connection handle");
  clear();
  if (connectionHandle_) {
    connectionHandle_->free();
  }
  connectionHandle_ = nullptr;
}

void ConnectionHandles::clear() {
  SQL_LOG_DEBUG_STREAM("ConnectionHandles::clear - size = " << _statementHandles.size());
  
  // Direct iteration - no need for intermediate vector
  for (const auto& [id, safeHandle] : _statementHandles) {
    SQL_LOG_DEBUG_STREAM("destruct OdbcStatementCache - free statement " << id);
    if (safeHandle) {
      // During connection cleanup, we need to force-free handles
      // Reset references first to avoid warning about freeing referenced handles
      safeHandle->resetReferences();
      safeHandle->free();
    }
  }
  
  _statementHandles.clear();
}

shared_ptr<IOdbcStatementHandle> ConnectionHandles::find(const long statement_id) {
  const auto itr = _statementHandles.find(statement_id);
  if (itr != _statementHandles.end()) {
    auto ref = itr->second->get();
    if (ref) {
      return ref;
    }
    SQL_LOG_WARNING_STREAM("Found invalid statement handle for id: " << statement_id);
  }
  return nullptr;
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
  
  auto safeHandle = std::make_shared<SafeHandle<IOdbcStatementHandle>>(
      "Statement_" + std::to_string(statement_id), handle);
  
  // Use try_emplace for atomic check-and-insert
  const auto [it, inserted] = _statementHandles.try_emplace(statement_id, safeHandle);
  
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
  
  // Create new statement handle
  auto handle = create_statement_handle();
  auto safeHandle = std::make_shared<SafeHandle<IOdbcStatementHandle>>(
      "Statement_" + std::to_string(statement_id), handle);
  
  // Get connection handle for allocation
  auto connRef = connectionHandle_->get();
  if (!connRef) {
    SQL_LOG_ERROR_STREAM("ConnectionHandles::checkout - connection handle invalid");
    return nullptr;
  }
  
  if (!safeHandle->alloc(connRef->get_handle())) {
    SQL_LOG_ERROR_STREAM("ConnectionHandles::checkout - failed to allocate statement handle");
    return nullptr;
  }
  
  // Store the SafeHandle wrapper
  _statementHandles[statement_id] = safeHandle;
  
  SQL_LOG_DEBUG_STREAM(
      "ConnectionHandles::checkout - created new handle for statementId = " << statement_id);
  
  // Return the handle itself, not the SafeHandle
  return safeHandle->get();
}

void ConnectionHandles::checkin(long statementId) {
  SQL_LOG_DEBUG_STREAM("ConnectionHandles::checkin - statementId = " << statementId);
  
  const auto itr = _statementHandles.find(statementId);
  if (itr == _statementHandles.end()) {
    SQL_LOG_ERROR_STREAM(
        "ConnectionHandles::checkin - no handle found for statementId = " << statementId);
    return;
  }
  
  // Free the handle through SafeHandle
  itr->second->free();
  _statementHandles.erase(statementId);
}

// Return the interface pointer
std::shared_ptr<IOdbcConnectionHandle> ConnectionHandles::connectionHandle() {
  if (connectionHandle_) {
    auto ref = connectionHandle_->get();
    if (ref) {
      return ref;
    }
    SQL_LOG_ERROR("Connection handle is invalid");
  }
  return nullptr;
}
}  // namespace mssql