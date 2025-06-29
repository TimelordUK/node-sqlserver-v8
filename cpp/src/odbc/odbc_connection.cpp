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
#include <odbc/odbc_statement_legacy.h>
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
    if (!environment_->Initialize(_odbcApi)) {
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

bool OdbcConnection::InitializeEnvironment(std::shared_ptr<IOdbcApi> odbcApiPtr) {
  SQL_LOG_FUNC_TRACER();
  SQL_LOG_INFO("Initializing shared ODBC environment");

  if (!sharedEnvironment_) {
    static std::mutex envMutex;
    std::lock_guard lock(envMutex);

    if (!sharedEnvironment_) {
      sharedEnvironment_ = OdbcEnvironmentFactory::CreateEnvironment();
      if (!sharedEnvironment_->Initialize(odbcApiPtr)) {
        SQL_LOG_ERROR("Failed to initialize shared ODBC environment");
        return false;
      }
    }
  }

  return true;
}

bool OdbcConnection::Open(const std::u16string& connectionString, int timeout) {
  SQL_LOG_FUNC_TRACER();
  SQL_LOG_INFO("Opening connection");

  SQL_LOG_DEBUG_STREAM("Connection string " << StringUtils::U16StringToUtf8(connectionString)
                                            << "...");

  std::lock_guard lock(_connectionMutex);

  if (connectionState != ConnectionClosed) {
    SQL_LOG_WARNING("Connection already open");
    _errorHandler->ClearErrors();
    return false;
  }

  // Ensure environment is initialized (thread-safe)
  if (!environment_->Initialize(_odbcApi)) {
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
  SQL_LOG_FUNC_TRACER();
  std::lock_guard lock(_connectionMutex);

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
      _connectionHandles.reset();
      _connectionHandles = nullptr;
    }
    _statementFactory.reset();
    _transactionManager.reset();
    _errorHandler.reset();
    connectionState = ConnectionClosed;
  }

  return true;
}

bool OdbcConnection::IsConnected() const {
  return connectionState == ConnectionOpen;
}

bool OdbcConnection::BeginTransaction() {
  SQL_LOG_FUNC_TRACER();
  std::lock_guard lock(_connectionMutex);
  if (connectionState != ConnectionOpen) {
    return false;
  }
  bool result = _transactionManager->BeginTransaction();
  if (!result) {
    // Copy errors from transaction manager to error handler
    auto txnErrors = _transactionManager->GetErrors();
    if (txnErrors) {
      for (const auto& error : *txnErrors) {
        _errorHandler->AddError(error);
      }
    }
  }
  return result;
}

bool OdbcConnection::CommitTransaction() {
  SQL_LOG_FUNC_TRACER();
  std::lock_guard lock(_connectionMutex);
  if (connectionState != ConnectionOpen) {
    return false;
  }
  bool result = _transactionManager->CommitTransaction();
  if (!result) {
    // Copy errors from transaction manager to error handler
    auto txnErrors = _transactionManager->GetErrors();
    if (txnErrors) {
      for (const auto& error : *txnErrors) {
        _errorHandler->AddError(error);
      }
    }
  }
  return result;
}

bool OdbcConnection::RollbackTransaction() {
  SQL_LOG_FUNC_TRACER();
  std::lock_guard lock(_connectionMutex);
  if (connectionState != ConnectionOpen) {
    return false;
  }
  bool result = _transactionManager->RollbackTransaction();
  if (!result) {
    // Copy errors from transaction manager to error handler
    auto txnErrors = _transactionManager->GetErrors();
    if (txnErrors) {
      for (const auto& error : *txnErrors) {
        _errorHandler->AddError(error);
      }
    }
  }
  return result;
}

std::shared_ptr<IOdbcStatement> OdbcConnection::CreateStatement(
    StatementType type, const std::shared_ptr<QueryOperationParams> operationParams) {
  if (connectionState != ConnectionOpen) {
    SQL_LOG_ERROR("Cannot create statement - connection is not open");
    return nullptr;
  }

  // Create the statement using the factory
  SQL_LOG_DEBUG_STREAM("OdbcConnection::CreateStatement: " << operationParams->toString());
  const auto statement = _statementFactory->CreateStatement(
      _connectionHandles->connectionHandle(), _odbcApi, type, _errorHandler, operationParams);

  // have to create map bewteen query id and statement handle
  _queryIdToStatementHandle[operationParams->id] = statement->GetStatementHandle();
  SQL_LOG_DEBUG_STREAM("OdbcConnection::CreateStatement: "
                       << statement->GetStatementHandle().toString() << " query id "
                       << operationParams->id << " size " << _queryIdToStatementHandle.size());

  return statement;
}

bool OdbcConnection::RemoveStatement(const std::shared_ptr<OdbcStatement>& statement) {
  std::lock_guard lock(_statementMutex);
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
    // Set CLOSED state before destroying statement (while JS context is still valid)
    statement->Close();
  }

  SQL_LOG_DEBUG_STREAM("RemoveStatement ID = " << statementId);
  // Ask the factory to remove the statement
  _statementFactory->RemoveStatement(statementId);
  return true;
}

bool OdbcConnection::CancelStatement(int queryId) {
  SQL_LOG_FUNC_TRACER();
  SQL_LOG_DEBUG_STREAM("OdbcConnection::CancelStatement called for ID = " << queryId);
  std::lock_guard lock(_statementMutex);

  auto it = _queryIdToStatementHandle.find(queryId);
  if (it != _queryIdToStatementHandle.end()) {
    SQL_LOG_DEBUG_STREAM("OdbcConnection::Found statement for ID = " << queryId);
  } else {
    SQL_LOG_WARNING_STREAM("OdbcConnection::Statement not found for ID = " << queryId);
    return false;
  }

  const auto statementId = it->second.getStatementId();
  auto statement = _statementFactory->GetStatement(statementId);
  if (statement) {
    SQL_LOG_DEBUG_STREAM("OdbcConnection::Found statement for ID = " << statementId);

    auto res = statement->Cancel();
    SQL_LOG_DEBUG_STREAM("OdbcConnection::CancelStatement ID = " << statementId
                                                                 << " - result = " << res);
    return res;
  } else {
    SQL_LOG_WARNING_STREAM("OdbcConnection::Statement not found for ID = " << statementId);
    return false;
  }
}

std::shared_ptr<BoundDatumSet> OdbcConnection::UnbindStatement(int queryId) {
  SQL_LOG_FUNC_TRACER();
  SQL_LOG_DEBUG_STREAM("OdbcConnection::UnbindStatement called for ID = " << queryId);
  std::lock_guard lock(_statementMutex);

  auto it = _queryIdToStatementHandle.find(queryId);
  if (it != _queryIdToStatementHandle.end()) {
    SQL_LOG_DEBUG_STREAM("OdbcConnection::Found statement for ID = " << queryId);
  } else {
    SQL_LOG_WARNING_STREAM("OdbcConnection::Statement not found for ID = " << queryId);
    return nullptr;
  }

  const auto statementId = it->second.getStatementId();
  auto statement = _statementFactory->GetStatement(statementId);
  if (statement) {
    SQL_LOG_DEBUG_STREAM("OdbcConnection::Found statement for ID = " << statementId);

    auto res = statement->Unbind();
    SQL_LOG_DEBUG_STREAM("OdbcConnection::UnbindStatement ID = " << statementId
                                                                 << " - result = " << res);
    return res;
  } else {
    SQL_LOG_WARNING_STREAM("OdbcConnection::Statement not found for ID = " << statementId);
    return nullptr;
  }
}

bool OdbcConnection::ExecuteQuery(const std::shared_ptr<QueryOperationParams> operationParams,
                                  const std::shared_ptr<BoundDatumSet> parameters,
                                  std::shared_ptr<QueryResult>& result,
                                  std::shared_ptr<IOdbcStateNotifier> stateNotifier) {
  // Create a transient statement
  SQL_LOG_FUNC_TRACER();
  auto statement = CreateStatement(StatementType::Legacy, operationParams);
  if (!statement) {
    return false;
  }

  // Set the state notifier if provided
  if (stateNotifier) {
    statement->SetStateNotifier(stateNotifier);
  }

  // Execute it
  result->setHandle(statement->GetStatementHandle());
  const bool executeResult = statement->Execute(parameters, result);

  return executeResult;
}

bool OdbcConnection::BindQuery(int queryId,
                               const std::shared_ptr<BoundDatumSet> parameters,
                               std::shared_ptr<QueryResult>& result) {
  auto it = _queryIdToStatementHandle.find(queryId);
  if (it == _queryIdToStatementHandle.end()) {
    SQL_LOG_ERROR_STREAM("OdbcConnection::BindQuery ID = " << queryId << " - statement not found");
    return false;
  }

  const auto statementId = it->second.getStatementId();
  auto statement = _statementFactory->GetStatement(statementId);
  SQL_LOG_DEBUG_STREAM("OdbcConnection::BindQuery ID = " << statementId);
  if (statement) {
    result->setHandle(statement->GetStatementHandle());
    return statement->BindExecute(parameters, result);
  }
  SQL_LOG_ERROR_STREAM("OdbcConnection::BindQuery ID = " << statementId
                                                         << " - statement not found");
  return false;
}

bool OdbcConnection::PrepareQuery(const std::shared_ptr<QueryOperationParams> operationParams,
                                  const std::shared_ptr<BoundDatumSet> parameters,
                                  std::shared_ptr<QueryResult>& result,
                                  std::shared_ptr<IOdbcStateNotifier> stateNotifier) {
  // Create a transient statement
  auto statement = CreateStatement(StatementType::Legacy, operationParams);
  if (!statement) {
    return false;
  }

  // Set the state notifier if provided
  if (stateNotifier) {
    statement->SetStateNotifier(stateNotifier);
  }

  // Execute it
  result->setHandle(statement->GetStatementHandle());
  SQL_LOG_DEBUG_STREAM(
      "OdbcConnection::PrepareQuery ID = " << statement->GetStatementHandle().toString());
  return statement->Prepare(parameters, result);
}

bool OdbcConnection::TryReadNextResult(int statementId, std::shared_ptr<QueryResult>& result) {
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