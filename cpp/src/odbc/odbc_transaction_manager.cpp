#include <odbc/odbc_transaction_manager.h>
#include <odbc/connection_handles.h>
#include <odbc/odbc_error.h>
#include <utils/Logger.h>

namespace mssql {

OdbcTransactionManager::OdbcTransactionManager(std::shared_ptr<ConnectionHandles> connectionHandles,
                                               std::shared_ptr<IOdbcApi> odbcApi)
    : _connectionHandles(connectionHandles), _odbcApi(odbcApi) {
  _errors = std::make_shared<std::vector<std::shared_ptr<OdbcError>>>();
}

bool OdbcTransactionManager::BeginTransaction() {
  return try_begin_tran();
}

bool OdbcTransactionManager::CommitTransaction() {
  return try_end_tran(SQL_COMMIT);
}

bool OdbcTransactionManager::RollbackTransaction() {
  return try_end_tran(SQL_ROLLBACK);
}

bool OdbcTransactionManager::try_begin_tran() {
  const auto connection = _connectionHandles->connectionHandle();
  if (!connection) {
    return false;
  }

  auto* const acoff = reinterpret_cast<SQLPOINTER>(SQL_AUTOCOMMIT_OFF);
  const auto ret =
      _odbcApi->SQLSetConnectAttr(connection->get_handle(), SQL_ATTR_AUTOCOMMIT, acoff, SQL_IS_UINTEGER);
  return CheckOdbcError(ret);
}

bool OdbcTransactionManager::try_end_tran(const SQLSMALLINT completion_type) {
  const auto connection = _connectionHandles->connectionHandle();
  if (!connection) {
    return false;
  }

  // End the transaction
  auto ret = SQLEndTran(SQL_HANDLE_DBC, connection->get_handle(), completion_type);
  if (!CheckOdbcError(ret)) {
    SQL_LOG_ERROR("SQLEndTran failed");
    return false;
  }

  // Put the connection back into auto commit mode
  auto* const acon = reinterpret_cast<SQLPOINTER>(SQL_AUTOCOMMIT_ON);
  ret = _odbcApi->SQLSetConnectAttr(connection->get_handle(), SQL_ATTR_AUTOCOMMIT, acon, SQL_IS_UINTEGER);
  return CheckOdbcError(ret);
}

bool OdbcTransactionManager::CheckOdbcError(const SQLRETURN ret) {
  if (!SQL_SUCCEEDED(ret)) {
    _errors->clear();
    const auto connection = _connectionHandles->connectionHandle();
    if (connection) {
      connection->read_errors(_odbcApi, _errors);
    }
    return false;
  }
  return true;
}

}  // namespace mssql