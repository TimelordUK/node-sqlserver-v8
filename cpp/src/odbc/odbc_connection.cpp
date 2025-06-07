// ReSharper disable CppInconsistentNaming
#include <platform.h>
#include <common/odbc_common.h>
#include <odbc/odbc_connection.h>

#include <utils/Logger.h>

#include <iomanip>  // For std::setw, std::setfill, std::hex
#include <iostream>

#include <common/string_utils.h>
#include <odbc/connection_handles.h>
#include <odbc/iodbc_api.h>
#include <odbc/odbc_environment.h>
#include <odbc/odbc_error_handler.h>
#include <odbc/odbc_handles.h>
#include <odbc/odbc_statement_factory.h>
#include <odbc/odbc_transaction_manager.h>

namespace mssql {

// Initialize static member
std::shared_ptr<IOdbcEnvironment> OdbcConnection::sharedEnvironment_;

// OdbcConnection implementation
OdbcConnection::OdbcConnection(std::shared_ptr<IOdbcEnvironment> environment,
                               std::shared_ptr<IOdbcApi> odbcApi,
                               int connectionId)
    : connectionState(ConnectionState::ConnectionClosed),
      _odbcApi(odbcApi ? odbcApi : std::make_shared<RealOdbcApi>()),
      _connectionId(connectionId) {
  // Set up environment
  if (environment) {
    environment_ = environment;
  } else if (sharedEnvironment_) {
    environment_ = sharedEnvironment_;
  } else {
    environment_ = OdbcEnvironmentFactory::CreateEnvironment();
    if (!environment_->Initialize()) {
      SQL_LOG_ERROR("Failed to initialize ODBC environment");
    }
  }

  // Create connection handles first
  _connectionHandles = std::make_shared<ConnectionHandles>(environment_->GetEnvironmentHandle());

  // Create error handler with the connection handles
  _errorHandler = std::make_shared<OdbcErrorHandler>(_connectionHandles, environment_, _odbcApi);

  // Create statement factory
  _statementFactory = std::make_shared<OdbcStatementFactory>(_connectionId, _connectionHandles);
}

OdbcConnection::~OdbcConnection() {
  Close();
}

bool OdbcConnection::InitializeEnvironment() {
  SQL_LOG_INFO("Initializing shared ODBC environment");

  if (!sharedEnvironment_) {
    static std::mutex envMutex;
    std::lock_guard lock(envMutex);

    if (!sharedEnvironment_) {
      sharedEnvironment_ = OdbcEnvironmentFactory::CreateEnvironment();
      if (!sharedEnvironment_->Initialize()) {
        SQL_LOG_ERROR("Failed to initialize shared ODBC environment");
        return false;
      }
    }
  }

  return true;
}

std::u16string OdbcConnection::ConvertConnectionString(const std::string& connectionString) {
  // Simple direct conversion to UCS2/UTF-16
  // This matches the approach used in the legacy driver
  std::u16string result;
  size_t len = connectionString.length();

  // Reserve space to hold the characters
  result.reserve(len);

  // Copy each ASCII/UTF-8 character directly to UTF-16
  // This is simplistic but works for common connection string characters
  for (size_t i = 0; i < len; i++) {
    result.push_back(static_cast<char16_t>(connectionString[i] & 0xFF));
  }

  return result;
}

bool OdbcConnection::Open(const std::u16string& connectionString, int timeout) {
  SQL_LOG_INFO("Opening connection");

  // Create a simple ASCII representation of the connection string for logging
  std::string logStr;
  logStr.reserve(30);
  for (size_t i = 0; i < std::min(connectionString.size(), static_cast<size_t>(30)); i++) {
    char c = static_cast<char>(connectionString[i] & 0xFF);
    if (c >= 32 && c <= 126) {
      logStr.push_back(c);
    }
  }
  SQL_LOG_DEBUG_STREAM("Connection string (partial): " << logStr << "...");

  std::lock_guard lock(_connectionMutex);

  if (connectionState != ConnectionClosed) {
    SQL_LOG_WARNING("Connection already open");
    _errorHandler->ClearErrors();
    return false;
  }

  if (!environment_->Initialize()) {
    SQL_LOG_ERROR("Failed to initialize ODBC environment");
    auto errors = std::make_shared<std::vector<std::shared_ptr<OdbcError>>>();
    environment_->ReadErrors(_odbcApi, errors);
    return false;
  }

  const bool result = try_open(connectionString, timeout);

  if (result) {
    SQL_LOG_INFO("Connection successfully opened");
    // Initialize transaction manager after successful connection
    _transactionManager = std::make_shared<OdbcTransactionManager>(_connectionHandles, _odbcApi);
  } else {
    SQL_LOG_ERROR("Failed to open connection");
  }

  return result;
}

bool OdbcConnection::Close() {
  std::lock_guard lock(_connectionMutex);

  // First release all prepared statements
  {
    std::lock_guard stmtLock(_statementMutex);
    _preparedStatements.clear();
  }

  if (connectionState != ConnectionClosed) {
    if (_connectionHandles) {
      // CRITICAL: Free all statement handles BEFORE disconnecting the connection
      // to prevent use-after-free errors
      SQL_LOG_DEBUG("Clearing statement handles before disconnect");
      _connectionHandles->clear();

      const auto connection = _connectionHandles->connectionHandle();
      if (connection) {
        SQL_LOG_DEBUG("SQLDisconnect");
        _odbcApi->SQLDisconnect(connection->get_handle());
      }
    }

    connectionState = ConnectionClosed;
    _transactionManager.reset();
  }

  return true;
}

bool OdbcConnection::IsConnected() const {
  return connectionState == ConnectionOpen;
}

bool OdbcConnection::BeginTransaction() {
  std::lock_guard lock(_connectionMutex);
  if (connectionState != ConnectionOpen) {
    return false;
  }
  return _transactionManager->BeginTransaction();
}

bool OdbcConnection::CommitTransaction() {
  std::lock_guard lock(_connectionMutex);
  if (connectionState != ConnectionOpen) {
    return false;
  }
  return _transactionManager->CommitTransaction();
}

bool OdbcConnection::RollbackTransaction() {
  std::lock_guard lock(_connectionMutex);
  if (connectionState != ConnectionOpen) {
    return false;
  }
  return _transactionManager->RollbackTransaction();
}

std::shared_ptr<IOdbcStatement> OdbcConnection::CreateStatement(
    StatementType type, const std::shared_ptr<QueryOperationParams> operationParams) {
  if (connectionState != ConnectionOpen) {
    SQL_LOG_ERROR("Cannot create statement - connection is not open");
    return nullptr;
  }

  // Create the statement using the factory
  SQL_LOG_DEBUG_STREAM("OdbcConnection::CreateStatement: " << operationParams->toString());
  const auto statement =
      _statementFactory->CreateStatement(_odbcApi, type, _errorHandler, operationParams);

  // have to create map bewteen query id and statement handle
  _queryIdToStatementHandle[operationParams->id] = statement->GetStatementHandle();
  SQL_LOG_DEBUG_STREAM("OdbcConnection::CreateStatement: "
                       << statement->GetStatementHandle().toString() << " query id "
                       << operationParams->id << " size " << _queryIdToStatementHandle.size());

  return statement;
}

std::shared_ptr<IOdbcStatement> OdbcConnection::GetPreparedStatement(
    const std::string& statementId) {
  std::lock_guard lock(_statementMutex);
  auto it = _preparedStatements.find(statementId);
  return it != _preparedStatements.end() ? it->second : nullptr;
}

std::shared_ptr<IOdbcStatement> OdbcConnection::GetStatement(const StatementHandle& handle) {
  std::lock_guard lock(_statementMutex);

  // Find statement by handle
  for (const auto& pair : _preparedStatements) {
    if (pair.second->GetStatementHandle() == handle) {
      return pair.second;
    }
  }

  // Statement not found
  return nullptr;
}

bool OdbcConnection::ReleasePreparedStatement(const std::string& statementId) {
  std::lock_guard lock(_statementMutex);
  return _preparedStatements.erase(statementId) > 0;
}

bool OdbcConnection::RemoveStatement(const std::shared_ptr<OdbcStatement>& statement) {
  std::lock_guard lock(_statementMutex);

  // Remove from prepared statements if it exists
  for (auto it = _preparedStatements.begin(); it != _preparedStatements.end(); ++it) {
    if (it->second == statement) {
      _preparedStatements.erase(it);
      break;
    }
  }

  // Ask the factory to remove the statement
  if (statement) {
    _statementFactory->RemoveStatement(statement->GetStatementHandle().getStatementId());
  }

  return true;
}

bool OdbcConnection::RemoveStatement(int statementId) {
  std::lock_guard lock(_statementMutex);

  // First get the statement from the factory
  auto statement = _statementFactory->GetStatement(statementId);
  if (statement) {
    // Remove from prepared statements if it exists
    for (auto it = _preparedStatements.begin(); it != _preparedStatements.end(); ++it) {
      if (it->second == statement) {
        _preparedStatements.erase(it);
        break;
      }
    }
  }

  SQL_LOG_DEBUG_STREAM("RemoveStatement ID = " << statementId);
  // Ask the factory to remove the statement
  _statementFactory->RemoveStatement(statementId);
  return true;
}

bool OdbcConnection::CancelStatement(int statementId) {
  SQL_LOG_DEBUG_STREAM("OdbcConnection::CancelStatement called for ID = " << statementId);
  std::lock_guard lock(_statementMutex);
  auto statement = _statementFactory->GetStatement(statementId);
  if (statement) {
    SQL_LOG_DEBUG_STREAM("OdbcConnection::Found statement for ID = " << statementId);
    // Remove from prepared statements if it exists
    for (auto it = _preparedStatements.begin(); it != _preparedStatements.end(); ++it) {
      if (it->second == statement) {
        _preparedStatements.erase(it);
        break;
      }
    }
    auto res = statement->Cancel();
    SQL_LOG_DEBUG_STREAM("OdbcConnection::CancelStatement ID = " << statementId
                                                                 << " - result = " << res);
    return res;
  } else {
    SQL_LOG_WARNING_STREAM("OdbcConnection::Statement not found for ID = " << statementId);
    return false;
  }
}

bool OdbcConnection::ExecuteQuery(const std::shared_ptr<QueryOperationParams> operationParams,
                                  const std::shared_ptr<BoundDatumSet> parameters,
                                  std::shared_ptr<QueryResult>& result) {
  // Create a transient statement
  auto statement = CreateStatement(OdbcStatement::Type::Legacy, operationParams);
  if (!statement) {
    return false;
  }

  // Execute it
  result->setHandle(statement->GetStatementHandle());
  return statement->Execute(parameters, result);
}

bool OdbcConnection::TryReadNextResult(int statementId, std::shared_ptr<QueryResult>& result) {
  // fprintf(stderr, "TryReadNextResult\n");
  // fprintf(stderr, "TryReadNextResult ID = %llu\n ", get_statement_id());
  SQL_LOG_DEBUG_STREAM("OdbcConnection::TryReadNextResult ID = " << statementId);
  std::lock_guard lock(_connectionMutex);

  if (connectionState != ConnectionOpen) {
    result->set_end_of_results(true);
    return false;
  }

  const auto& statement = GetStatement(statementId);
  if (!statement) {
    SQL_LOG_DEBUG_STREAM("OdbcConnection::TryReadNextResult ID = " << statementId
                                                                   << " - statement not found");
    result->set_end_of_results(true);
    return false;
  }

  SQL_LOG_DEBUG_STREAM("OdbcConnection::TryReadNextResult ID = " << statementId
                                                                 << " - calling ReadNextResult");
  return statement->ReadNextResult(result);
}

const std::vector<std::shared_ptr<OdbcError>>& OdbcConnection::GetErrors() const {
  return _errorHandler->GetErrors();
}

std::shared_ptr<IOdbcStatement> OdbcConnection::GetStatement(int statementId) const {
  return _statementFactory->GetStatement(statementId);
}

bool OdbcConnection::try_open(const std::u16string& connection_string, const int timeout) {
  _errorHandler->ClearErrors();

  // Simple logging for connection attempt
  SQL_LOG_DEBUG_STREAM("OdbcConnection::try_open: Opening connection with "
                       << connection_string.size() << " UTF-16 characters");

  const auto connection = _connectionHandles->connectionHandle();
  if (connection == nullptr) {
    _errorHandler->ClearErrors();
    auto errors = std::make_shared<std::vector<std::shared_ptr<OdbcError>>>();
    environment_->ReadErrors(_odbcApi, errors);
    return false;
  }

  // Set connection timeout
  auto ret =
      _odbcApi->SQLSetConnectAttr(connection->get_handle(),
                                  SQL_ATTR_CONNECTION_TIMEOUT,
                                  reinterpret_cast<SQLPOINTER>(static_cast<intptr_t>(timeout)),
                                  SQL_IS_INTEGER);
  if (!_errorHandler->CheckOdbcError(ret)) {
    SQL_LOG_ERROR("OdbcConnection::try_open: Failed to set connection timeout");
    return false;
  }

  // Set login timeout
  ret = _odbcApi->SQLSetConnectAttr(connection->get_handle(),
                                    SQL_ATTR_LOGIN_TIMEOUT,
                                    reinterpret_cast<SQLPOINTER>(static_cast<intptr_t>(timeout)),
                                    SQL_IS_INTEGER);
  if (!_errorHandler->CheckOdbcError(ret)) {
    SQL_LOG_ERROR("OdbcConnection::try_open: Failed to set login timeout");
    return false;
  }

  // Set BCP option (SQL Server specific)
  ret = _odbcApi->SQLSetConnectAttr(connection->get_handle(),
                                    SQL_COPT_SS_BCP,
                                    reinterpret_cast<SQLPOINTER>(SQL_BCP_ON),
                                    SQL_IS_INTEGER);
  if (!_errorHandler->CheckOdbcError(ret)) {
    SQL_LOG_WARNING(
        "OdbcConnection::try_open: Failed to set BCP option - this might be expected "
        "for non-SQL Server drivers");
  }

  // Already added sanitized connection string logging above

  // Direct pass-through to SQLDriverConnect with the UTF-16 data
  // This approach matches the legacy driver implementation
  ret = _odbcApi->SQLDriverConnect(
      connection->get_handle(),
      nullptr,
      reinterpret_cast<SQLWCHAR*>(const_cast<char16_t*>(connection_string.data())),
      static_cast<SQLSMALLINT>(connection_string.size()),
      nullptr,
      0,
      nullptr,
      SQL_DRIVER_NOPROMPT);

  if (!SQL_SUCCEEDED(ret)) {
    SQL_LOG_ERROR("OdbcConnection::try_open: SQLDriverConnect failed");

    // Get ODBC diagnostic records
    auto diagnostics = _odbcApi->GetDiagnostics();

    // Create error objects and add them to the error handler
    if (!diagnostics.empty()) {
      for (const auto& diag : diagnostics) {
        std::shared_ptr<OdbcError> error =
            std::make_shared<OdbcError>(diag.sqlState, diag.message, diag.nativeError);
        _errorHandler->AddError(error);

        SQL_LOG_ERROR_STREAM("OdbcConnection::try_open: ODBC Error: SQLSTATE="
                             << diag.sqlState << ", Native Error=" << diag.nativeError
                             << ", Message=" << diag.message);
      }
    } else {
      // No diagnostics available, create a generic error
      std::shared_ptr<OdbcError> error = std::make_shared<OdbcError>(
          "08001",  // General connection error
          "Failed to connect to the database server with no diagnostic information",
          0);
      _errorHandler->AddError(error);
    }

    return false;
  }

  connectionState = ConnectionOpen;
  return true;
}
}  // namespace mssql