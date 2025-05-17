// ReSharper disable CppInconsistentNaming

#include "common/platform.h"
#include "odbc/odbc_connection.h"
#include "odbc/odbc_environment.h"
#include "odbc/odbc_handles.h"
#include "common/odbc_common.h"
#include "odbc/odbc_transaction_manager.h"
#include "odbc/odbc_error_handler.h"
#include "odbc/odbc_statement_factory.h"
#include "common/string_utils.h"
#include "odbc/iodbc_api.h"
#include "odbc/connection_handles.h"
#include <Logger.h>
#include <iostream>
#include <iomanip> // For std::setw, std::setfill, std::hex

namespace mssql
{

  // Initialize static member
  std::shared_ptr<IOdbcEnvironment> OdbcConnection::sharedEnvironment_;

  // OdbcConnection implementation
  OdbcConnection::OdbcConnection(
      std::shared_ptr<IOdbcEnvironment> environment,
      std::shared_ptr<IOdbcApi> odbcApi,
      int connectionId)
      : connectionState(ConnectionState::ConnectionClosed),
        _odbcApi(odbcApi ? odbcApi : std::make_shared<RealOdbcApi>()),
        _connectionId(connectionId),
        _statementFactory(std::make_shared<OdbcStatementFactory>(connectionId))
  {
    // Set up environment
    if (environment)
    {
      environment_ = environment;
    }
    else if (sharedEnvironment_)
    {
      environment_ = sharedEnvironment_;
    }
    else
    {
      environment_ = OdbcEnvironmentFactory::CreateEnvironment();
      if (!environment_->Initialize())
      {
        SQL_LOG_ERROR("Failed to initialize ODBC environment");
      }
    }

    // Create error handler first since other components need it
    _errorHandler = std::make_shared<OdbcErrorHandler>(_connectionHandles);
  }

  OdbcConnection::~OdbcConnection()
  {
    Close();
  }

  bool OdbcConnection::InitializeEnvironment()
  {
    SQL_LOG_INFO("Initializing shared ODBC environment");

    if (!sharedEnvironment_)
    {
      static std::mutex envMutex;
      std::lock_guard lock(envMutex);

      if (!sharedEnvironment_)
      {
        sharedEnvironment_ = OdbcEnvironmentFactory::CreateEnvironment();
        if (!sharedEnvironment_->Initialize())
        {
          SQL_LOG_ERROR("Failed to initialize shared ODBC environment");
          return false;
        }
      }
    }

    return true;
  }

  std::u16string OdbcConnection::ConvertConnectionString(
      const std::string &connectionString)
  {
    // Simple direct conversion to UCS2/UTF-16
    // This matches the approach used in the legacy driver
    std::u16string result;
    size_t len = connectionString.length();

    // Reserve space to hold the characters
    result.reserve(len);

    // Copy each ASCII/UTF-8 character directly to UTF-16
    // This is simplistic but works for common connection string characters
    for (size_t i = 0; i < len; i++)
    {
      result.push_back(static_cast<char16_t>(connectionString[i] & 0xFF));
    }

    return result;
  }

  bool OdbcConnection::Open(const std::u16string &connectionString, int timeout)
  {
    SQL_LOG_INFO("Opening connection");

    // Create a simple ASCII representation of the connection string for logging
    std::string logStr;
    logStr.reserve(30);
    for (size_t i = 0; i < std::min(connectionString.size(), static_cast<size_t>(30)); i++)
    {
      char c = static_cast<char>(connectionString[i] & 0xFF);
      if (c >= 32 && c <= 126)
      {
        logStr.push_back(c);
      }
    }
    SQL_LOG_DEBUG_STREAM("Connection string (partial): " << logStr << "...");

    std::lock_guard lock(_connectionMutex);

    if (connectionState != ConnectionClosed)
    {
      SQL_LOG_WARNING("Connection already open");
      _errorHandler->ClearErrors();
      return false;
    }

    if (!environment_->Initialize())
    {
      SQL_LOG_ERROR("Failed to initialize ODBC environment");
      auto errors = std::make_shared<std::vector<std::shared_ptr<OdbcError>>>();
      environment_->ReadErrors(errors);
      return false;
    }

    const bool result = try_open(connectionString, timeout);

    if (result)
    {
      SQL_LOG_INFO("Connection successfully opened");
      // Initialize transaction manager after successful connection
      _transactionManager = std::make_shared<OdbcTransactionManager>(_connectionHandles);
    }
    else
    {
      SQL_LOG_ERROR("Failed to open connection");
    }

    return result;
  }

  bool OdbcConnection::Close()
  {
    std::lock_guard lock(_connectionMutex);

    // First release all prepared statements
    {
      std::lock_guard stmtLock(_statementMutex);
      _preparedStatements.clear();
    }

    if (connectionState != ConnectionClosed)
    {
      if (_connectionHandles)
      {
        const auto connection = _connectionHandles->connectionHandle();
        if (connection)
        {
          SQL_LOG_DEBUG("SQLDisconnect");
          _odbcApi->SQLDisconnect(connection->get_handle());
        }
        _connectionHandles->clear();
      }

      connectionState = ConnectionClosed;
      _transactionManager.reset();
    }

    return true;
  }

  bool OdbcConnection::IsConnected() const
  {
    return connectionState == ConnectionOpen;
  }

  bool OdbcConnection::BeginTransaction()
  {
    std::lock_guard lock(_connectionMutex);
    if (connectionState != ConnectionOpen)
    {
      return false;
    }
    return _transactionManager->BeginTransaction();
  }

  bool OdbcConnection::CommitTransaction()
  {
    std::lock_guard lock(_connectionMutex);
    if (connectionState != ConnectionOpen)
    {
      return false;
    }
    return _transactionManager->CommitTransaction();
  }

  bool OdbcConnection::RollbackTransaction()
  {
    std::lock_guard lock(_connectionMutex);
    if (connectionState != ConnectionOpen)
    {
      return false;
    }
    return _transactionManager->RollbackTransaction();
  }

  std::shared_ptr<IOdbcStatement> OdbcConnection::CreateStatement(
      StatementType type,
      const std::u16string &query,
      const std::u16string &tvpType)
  {
    if (connectionState != ConnectionOpen)
    {
      SQL_LOG_ERROR("Cannot create statement - connection is not open");
      return nullptr;
    }

    // Create a new statement handle
    auto handle = create_statement_handle();
    if (!handle->alloc(_connectionHandles->connectionHandle()->get_handle()))
    {
      SQL_LOG_ERROR("Failed to allocate statement handle");
      return nullptr;
    }

    // Convert from std::u16string to std::string using our proper conversion utility
    std::string utf8Query = StringUtils::U16StringToUtf8(query);
    std::string utf8TvpType = StringUtils::U16StringToUtf8(tvpType);

    // Create the statement using the factory
    return _statementFactory->CreateStatement(_odbcApi, type, handle, _errorHandler, utf8Query, utf8TvpType);
  }

  std::shared_ptr<IOdbcStatement> OdbcConnection::GetPreparedStatement(
      const std::string &statementId)
  {
    std::lock_guard lock(_statementMutex);
    auto it = _preparedStatements.find(statementId);
    return it != _preparedStatements.end() ? it->second : nullptr;
  }

  std::shared_ptr<IOdbcStatement> OdbcConnection::GetStatement(
      const StatementHandle &handle)
  {
    std::lock_guard lock(_statementMutex);

    // Find statement by handle
    for (const auto &pair : _preparedStatements)
    {
      if (pair.second->GetStatementHandle() == handle)
      {
        return pair.second;
      }
    }

    // Statement not found
    return nullptr;
  }

  bool OdbcConnection::ReleasePreparedStatement(
      const std::string &statementId)
  {
    std::lock_guard lock(_statementMutex);
    return _preparedStatements.erase(statementId) > 0;
  }

  bool OdbcConnection::ExecuteQuery(
      const std::u16string &sqlText,
      const std::vector<std::shared_ptr<QueryParameter>> &parameters,
      std::shared_ptr<QueryResult> &result)
  {
    // Create a transient statement
    auto statement = CreateStatement(OdbcStatement::Type::Transient, sqlText);
    if (!statement)
    {
      return false;
    }

    // Execute it
    return statement->Execute(parameters, result);
  }

  bool OdbcConnection::TryReadNextResult(int statementId, std::shared_ptr<QueryResult> &result)
  {
    // fprintf(stderr, "TryReadNextResult\n");
    // fprintf(stderr, "TryReadNextResult ID = %llu\n ", get_statement_id());
    SQL_LOG_DEBUG_STREAM("TryReadNextResult ID = " << statementId);
    std::lock_guard lock(_connectionMutex);

    if (connectionState != ConnectionOpen)
    {
      result->set_end_of_results(true);
      return false;
    }

    const auto &statement = GetStatement(statementId);
    if (!statement)
    {
      SQL_LOG_DEBUG_STREAM("TryReadNextResult ID = " << statementId << " - statement not found");
      result->set_end_of_results(true);
      return false;
    }

    SQL_LOG_DEBUG_STREAM("TryReadNextResult ID = " << statementId << " - calling ReadNextResult");
    return statement->ReadNextResult(result);
  }

  const std::vector<std::shared_ptr<OdbcError>> &OdbcConnection::GetErrors() const
  {
    return _errorHandler->GetErrors();
  }

  std::shared_ptr<IOdbcStatement> OdbcConnection::GetStatement(int statementId) const
  {
    return _statementFactory->GetStatement(statementId);
  }

  bool OdbcConnection::try_open(const std::u16string &connection_string, const int timeout)
  {
    _errorHandler->ClearErrors();

    // Simple logging for connection attempt
    SQL_LOG_DEBUG_STREAM("Opening connection with " << connection_string.size() << " UTF-16 characters");

    // Create a sanitized version for logging
    // std::string sanitizedStr;
    // sanitizedStr.reserve(connection_string.size());

    // for (const auto &c : connection_string)
    // {
    //   char ascii = static_cast<char>(c & 0xFF);
    //   if (ascii >= 32 && ascii <= 126)
    //   {
    //     sanitizedStr.push_back(ascii);
    //   }
    // }

    // Log a sanitized version with passwords masked
    // if (!sanitizedStr.empty()) {
    //   SQL_LOG_DEBUG_STREAM("Connection string (sanitized): "
    //                       << StringUtils::SanitizeConnectionString(sanitizedStr));
    // }

    this->_connectionHandles = std::make_shared<ConnectionHandles>(environment_->GetEnvironmentHandle());

    const auto connection = _connectionHandles->connectionHandle();
    if (connection == nullptr)
    {
      _errorHandler->ClearErrors();
      auto errors = std::make_shared<std::vector<std::shared_ptr<OdbcError>>>();
      environment_->ReadErrors(errors);
      return false;
    }

    // Set connection timeout
    auto ret = _odbcApi->SQLSetConnectAttr(connection->get_handle(), SQL_ATTR_CONNECTION_TIMEOUT,
                                           reinterpret_cast<SQLPOINTER>(static_cast<intptr_t>(timeout)), SQL_IS_INTEGER);
    if (!_errorHandler->CheckOdbcError(ret))
    {
      SQL_LOG_ERROR("Failed to set connection timeout");
      return false;
    }

    // Set login timeout
    ret = _odbcApi->SQLSetConnectAttr(connection->get_handle(), SQL_ATTR_LOGIN_TIMEOUT,
                                      reinterpret_cast<SQLPOINTER>(static_cast<intptr_t>(timeout)), SQL_IS_INTEGER);
    if (!_errorHandler->CheckOdbcError(ret))
    {
      SQL_LOG_ERROR("Failed to set login timeout");
      return false;
    }

    // Set BCP option (SQL Server specific)
    ret = _odbcApi->SQLSetConnectAttr(connection->get_handle(), SQL_COPT_SS_BCP,
                                      reinterpret_cast<SQLPOINTER>(SQL_BCP_ON), SQL_IS_INTEGER);
    if (!_errorHandler->CheckOdbcError(ret))
    {
      SQL_LOG_WARNING("Failed to set BCP option - this might be expected for non-SQL Server drivers");
    }

    // Already added sanitized connection string logging above

    // Direct pass-through to SQLDriverConnect with the UTF-16 data
    // This approach matches the legacy driver implementation
    ret = _odbcApi->SQLDriverConnect(
        connection->get_handle(),
        nullptr,
        reinterpret_cast<SQLWCHAR *>(const_cast<char16_t *>(connection_string.data())),
        static_cast<SQLSMALLINT>(connection_string.size()),
        nullptr,
        0,
        nullptr,
        SQL_DRIVER_NOPROMPT);

    if (!SQL_SUCCEEDED(ret))
    {
      SQL_LOG_ERROR("SQLDriverConnect failed");

      // Get ODBC diagnostic records
      auto diagnostics = _odbcApi->GetDiagnostics();

      // Create error objects and add them to the error handler
      if (!diagnostics.empty())
      {
        for (const auto &diag : diagnostics)
        {
          std::shared_ptr<OdbcError> error = std::make_shared<OdbcError>(
              diag.sqlState,
              diag.message,
              diag.nativeError);
          _errorHandler->AddError(error);

          SQL_LOG_ERROR_STREAM("ODBC Error: SQLSTATE=" << diag.sqlState
                                                       << ", Native Error=" << diag.nativeError
                                                       << ", Message=" << diag.message);
        }
      }
      else
      {
        // No diagnostics available, create a generic error
        std::shared_ptr<OdbcError> error = std::make_shared<OdbcError>(
            "08001", // General connection error
            "Failed to connect to the database server with no diagnostic information",
            0);
        _errorHandler->AddError(error);
      }

      return false;
    }

    connectionState = ConnectionOpen;
    return true;
  }
}