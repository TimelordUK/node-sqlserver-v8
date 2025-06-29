#pragma once

#include <common/odbc_common.h>

#include <functional>
#include <map>
#include <memory>
#include <set>
#include <vector>

#include "odbc/odbc_handles.h"
#include "odbc/safe_handle.h"
#include "platform.h"

namespace mssql {
/**
 * @brief Manages ODBC statement handles for a connection
 * 
 * This class is NOT thread-safe by itself. Thread safety is provided
 * by the containing OdbcConnection class through external synchronization.
 * 
 * The class provides a checkout/checkin pattern for statement handles
 * where each statement is identified by a unique ID.
 */
class ConnectionHandles {
 public:
  ConnectionHandles(std::shared_ptr<IOdbcEnvironmentHandle> env);
  ~ConnectionHandles();
  void clear();
  /**
   * @brief Get the underlying ODBC connection handle
   * @return Shared pointer to the connection handle
   */
  std::shared_ptr<IOdbcConnectionHandle> connectionHandle();
  /**
   * @brief Checkout a statement handle by ID, creating if necessary
   * @param statementId Unique identifier for the statement
   * @return Statement handle or nullptr on error
   */
  std::shared_ptr<IOdbcStatementHandle> checkout(long statementId);
  /**
   * @brief Check in a statement handle, freeing its resources
   * @param statementId Identifier of the statement to release
   */
  void checkin(long statementId);
  /**
   * @brief Get the number of active statement handles
   * @return Count of statement handles
   */
  size_t size() const;
  
  /**
   * @brief Check if a statement handle exists
   * @param statement_id Statement identifier to check
   * @return true if the statement exists
   */
  bool exists(long statement_id) const;

 private:
  shared_ptr<IOdbcStatementHandle> store(const long statement_id,
                                         shared_ptr<IOdbcStatementHandle> handle);
  shared_ptr<IOdbcStatementHandle> find(const long statement_id);
  std::map<long, std::shared_ptr<SafeHandle<IOdbcStatementHandle>>> _statementHandles;
  std::shared_ptr<IOdbcEnvironmentHandle> rawEnvHandle_;  // Raw handle - not wrapped in SafeHandle
  std::shared_ptr<SafeHandle<IOdbcConnectionHandle>> connectionHandle_;
};
}  // namespace mssql