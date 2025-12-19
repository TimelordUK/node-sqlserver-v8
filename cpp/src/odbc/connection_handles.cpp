#include <platform.h>
#include <odbc/connection_handles.h>

#include <common/odbc_common.h>

#include <algorithm>
#include <functional>
#include <string>
#include <vector>
#include <chrono>
#include <thread>

#include <odbc/odbc_handles.h>
#include <odbc/safe_handle.h>

#include <utils/Logger.h>

namespace mssql {
ConnectionHandles::ConnectionHandles(std::shared_ptr<IOdbcEnvironmentHandle> env)
    : rawEnvHandle_(env), connectionHandle_(nullptr) {
  if (!env) {
    SQL_LOG_ERROR("ConnectionHandles constructor received null environment handle");
    return;
  }

  // Store the raw environment handle without wrapping it in SafeHandle
  // The environment is shared and managed externally, so we must not free it
  // when this ConnectionHandles instance is destroyed

  // Create and allocate the connection handle
  auto connHandle = create_connection_handle();
  connectionHandle_ = std::make_shared<SafeHandle<IOdbcConnectionHandle>>("Connection", connHandle);

  if (!connectionHandle_->alloc(env->get_handle())) {
    SQL_LOG_ERROR("Failed to allocate connection handle");
  }
}

ConnectionHandles::~ConnectionHandles() {
  SQL_LOG_DEBUG_STREAM("ConnectionHandles::~ConnectionHandles - free connection handle");
  if (connectionHandle_) {
    connectionHandle_->free();
  }
  connectionHandle_ = nullptr;
}

void ConnectionHandles::clear() {
  std::lock_guard<std::mutex> lock(_handlesMutex);

  SQL_LOG_DEBUG_STREAM("ConnectionHandles::clear - ENTER - thread="
                       << std::this_thread::get_id() << " size=" << _statementHandles.size());

  // Direct iteration - no need for intermediate vector
  for (const auto& [id, safeHandle] : _statementHandles) {
    SQL_LOG_DEBUG_STREAM("ConnectionHandles::clear - processing statement " << id
                         << " thread=" << std::this_thread::get_id());
    if (safeHandle) {
      auto handle = safeHandle->get();
      if (handle) {
        // Cancel any pending operations before freeing the handle
        // This is critical for statements that may have timed out or are still executing
        SQL_LOG_DEBUG_STREAM("ConnectionHandles::clear - cancelling statement " << id);

        // First try SQLCancel for older ODBC compatibility
        auto cancelResult = SQLCancel(handle->get_handle());
        SQL_LOG_DEBUG_STREAM("ConnectionHandles::clear - SQLCancel result for statement "
                             << id << ": " << cancelResult);

        // Also try SQLCancelHandle which is more robust for newer drivers
        cancelResult = SQLCancelHandle(SQL_HANDLE_STMT, handle->get_handle());
        SQL_LOG_DEBUG_STREAM("ConnectionHandles::clear - SQLCancelHandle result for statement "
                             << id << ": " << cancelResult);

        // Give a small delay to allow cancellation to complete
        std::this_thread::sleep_for(std::chrono::milliseconds(10));

        // Also try to explicitly close the cursor/statement
        SQLCloseCursor(handle->get_handle());
        SQLFreeStmt(handle->get_handle(), SQL_CLOSE);
      } else {
        SQL_LOG_WARNING_STREAM("ConnectionHandles::clear - statement " << id
                               << " handle already invalid/freed");
      }
      // During connection cleanup, we need to force-free handles
      // Reset references first to avoid warning about freeing referenced handles
      SQL_LOG_DEBUG_STREAM("ConnectionHandles::clear - freeing statement " << id
                           << " thread=" << std::this_thread::get_id());
      safeHandle->resetReferences();
      safeHandle->free();
    } else {
      SQL_LOG_WARNING_STREAM("ConnectionHandles::clear - statement " << id
                             << " safeHandle is null");
    }
  }

  _statementHandles.clear();
  SQL_LOG_DEBUG_STREAM("ConnectionHandles::clear - EXIT - thread=" << std::this_thread::get_id());
}

shared_ptr<IOdbcStatementHandle> ConnectionHandles::find_unlocked(const long statement_id) {
  // NOTE: This is an internal method - caller must hold _handlesMutex
  const auto itr = _statementHandles.find(statement_id);
  if (itr != _statementHandles.end()) {
    auto ref = itr->second->get();
    if (ref) {
      return ref;
    }
    SQL_LOG_WARNING_STREAM("find_unlocked - statement " << statement_id
                           << " found but handle is invalid");
  }
  return nullptr;
}

size_t ConnectionHandles::size() const {
  std::lock_guard<std::mutex> lock(_handlesMutex);
  return _statementHandles.size();
}

bool ConnectionHandles::exists(long statement_id) const {
  std::lock_guard<std::mutex> lock(_handlesMutex);
  return _statementHandles.find(statement_id) != _statementHandles.end();
}

shared_ptr<IOdbcStatementHandle> ConnectionHandles::store(const long statement_id,
                                                          shared_ptr<IOdbcStatementHandle> handle) {
  // NOTE: This is an internal method - caller must hold _handlesMutex
  SQL_LOG_DEBUG_STREAM("ConnectionHandles::store - statementId=" << statement_id
                       << " thread=" << std::this_thread::get_id());

  auto safeHandle = std::make_shared<SafeHandle<IOdbcStatementHandle>>(
      "Statement_" + std::to_string(statement_id), handle);

  // Use try_emplace for atomic check-and-insert
  const auto [it, inserted] = _statementHandles.try_emplace(statement_id, safeHandle);

  if (!inserted) {
    SQL_LOG_ERROR_STREAM("ConnectionHandles::store - statementId already exists = " << statement_id
                         << " thread=" << std::this_thread::get_id());
    return nullptr;
  }

  SQL_LOG_DEBUG_STREAM("ConnectionHandles::store - statementId=" << statement_id
                       << " stored successfully, total handles=" << _statementHandles.size());
  return handle;
}

shared_ptr<IOdbcStatementHandle> ConnectionHandles::checkout(long statement_id) {
  if (statement_id < 0) {
    SQL_LOG_ERROR_STREAM("ConnectionHandles::checkout - invalid statementId=" << statement_id
                         << " thread=" << std::this_thread::get_id());
    return nullptr;
  }

  std::lock_guard<std::mutex> lock(_handlesMutex);

  SQL_LOG_DEBUG_STREAM("ConnectionHandles::checkout - ENTER statementId=" << statement_id
                       << " thread=" << std::this_thread::get_id()
                       << " current_handles=" << _statementHandles.size());

  auto statement = find_unlocked(statement_id);
  if (statement) {
    SQL_LOG_DEBUG_STREAM("ConnectionHandles::checkout - found existing statementId=" << statement_id
                         << " thread=" << std::this_thread::get_id());
    return statement;
  }

  // Create new statement handle
  auto handle = create_statement_handle();
  auto safeHandle = std::make_shared<SafeHandle<IOdbcStatementHandle>>(
      "Statement_" + std::to_string(statement_id), handle);

  // Get connection handle for allocation
  auto connRef = connectionHandle_->get();
  if (!connRef) {
    SQL_LOG_ERROR_STREAM("ConnectionHandles::checkout - connection handle invalid, statementId="
                         << statement_id << " thread=" << std::this_thread::get_id());
    return nullptr;
  }

  if (!safeHandle->alloc(connRef->get_handle())) {
    SQL_LOG_ERROR_STREAM("ConnectionHandles::checkout - failed to allocate statement handle for statementId="
                         << statement_id << " thread=" << std::this_thread::get_id());
    return nullptr;
  }

  // Store the SafeHandle wrapper
  _statementHandles[statement_id] = safeHandle;

  SQL_LOG_DEBUG_STREAM("ConnectionHandles::checkout - created new handle for statementId="
                       << statement_id << " thread=" << std::this_thread::get_id()
                       << " total_handles=" << _statementHandles.size());

  // Return the handle itself, not the SafeHandle
  return safeHandle->get();
}

void ConnectionHandles::checkin(long statementId) {
  std::lock_guard<std::mutex> lock(_handlesMutex);

  SQL_LOG_DEBUG_STREAM("ConnectionHandles::checkin - ENTER statementId=" << statementId
                       << " thread=" << std::this_thread::get_id()
                       << " current_handles=" << _statementHandles.size());

  const auto itr = _statementHandles.find(statementId);
  if (itr == _statementHandles.end()) {
    // This can happen legitimately if clear() already freed this statement
    // during connection close - not necessarily an error
    SQL_LOG_WARNING_STREAM("ConnectionHandles::checkin - statementId=" << statementId
                           << " not found (may have been freed by clear()) thread="
                           << std::this_thread::get_id());
    return;
  }

  // Free the handle through SafeHandle
  SQL_LOG_DEBUG_STREAM("ConnectionHandles::checkin - freeing statementId=" << statementId
                       << " thread=" << std::this_thread::get_id());
  itr->second->free();
  _statementHandles.erase(statementId);

  SQL_LOG_DEBUG_STREAM("ConnectionHandles::checkin - EXIT statementId=" << statementId
                       << " thread=" << std::this_thread::get_id()
                       << " remaining_handles=" << _statementHandles.size());
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