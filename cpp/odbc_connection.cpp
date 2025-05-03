// ReSharper disable CppInconsistentNaming
#include "odbc_connection.h"
#include "odbc_environment.h"
#include "odbc_handles.h"
#include "odbc_common.h"
#include "odbc_transaction_manager.h"
#include "odbc_error_handler.h"
#include "string_utils.h"
#include "iodbc_api.h"
#include <Logger.h>
#include <iostream>

namespace mssql
{

  // Initialize static member
  std::shared_ptr<IOdbcEnvironment> OdbcConnection::sharedEnvironment_;

  // OdbcConnection implementation
  OdbcConnection::OdbcConnection(
      std::shared_ptr<IOdbcEnvironment> environment,
      std::shared_ptr<IOdbcApi> odbcApi)
      : connectionState(ConnectionState::ConnectionClosed),
        _odbcApi(odbcApi ? odbcApi : std::make_shared<RealOdbcApi>())
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

  std::shared_ptr<std::vector<uint16_t>> OdbcConnection::ConvertConnectionString(
      const std::string &connectionString)
  {
    return StringUtils::Utf8ToUtf16(connectionString);
  }

  bool OdbcConnection::Open(const std::string &connectionString, int timeout)
  {
    SQL_LOG_INFO("Opening connection");
    SQL_LOG_DEBUG_STREAM("Connection string (partial): " << connectionString.substr(0, 30) << "...");

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

    const auto wideConnStr = ConvertConnectionString(connectionString);
    const bool result = try_open(wideConnStr, timeout);

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

  std::shared_ptr<OdbcStatement> OdbcConnection::CreateStatement(
      OdbcStatement::Type type,
      const std::string &query,
      const std::string &tvpType)
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

    // Create the statement using the factory
    return StatementFactory::CreateStatement(
        type, handle, _errorHandler, query, tvpType);
  }

  std::shared_ptr<OdbcStatement> OdbcConnection::GetPreparedStatement(
      const std::string &statementId)
  {
    std::lock_guard lock(_statementMutex);
    auto it = _preparedStatements.find(statementId);
    return it != _preparedStatements.end() ? it->second : nullptr;
  }

  bool OdbcConnection::ReleasePreparedStatement(
      const std::string &statementId)
  {
    std::lock_guard lock(_statementMutex);
    return _preparedStatements.erase(statementId) > 0;
  }

  bool OdbcConnection::ExecuteQuery(
      const std::string &sqlText,
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

  const std::vector<std::shared_ptr<OdbcError>> &OdbcConnection::GetErrors() const
  {
    return _errorHandler->GetErrors();
  }

  bool OdbcConnection::try_open(std::shared_ptr<std::vector<uint16_t>> connection_string, const int timeout)
  {
    _errorHandler->ClearErrors();

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
                                           reinterpret_cast<SQLPOINTER>(timeout), SQL_IS_INTEGER);
    if (!_errorHandler->CheckOdbcError(ret))
    {
      SQL_LOG_ERROR("Failed to set connection timeout");
      return false;
    }

    // Set login timeout
    ret = _odbcApi->SQLSetConnectAttr(connection->get_handle(), SQL_ATTR_LOGIN_TIMEOUT,
                                      reinterpret_cast<SQLPOINTER>(timeout), SQL_IS_INTEGER);
    if (!_errorHandler->CheckOdbcError(ret))
    {
      SQL_LOG_ERROR("Failed to set login timeout");
      return false;
    }

    // Set BCP option
    ret = _odbcApi->SQLSetConnectAttr(connection->get_handle(), SQL_COPT_SS_BCP,
                                      reinterpret_cast<SQLPOINTER>(SQL_BCP_ON), SQL_IS_INTEGER);
    if (!_errorHandler->CheckOdbcError(ret))
    {
      SQL_LOG_ERROR("Failed to set BCP option");
      return false;
    }

    ret = _odbcApi->SQLDriverConnect(connection->get_handle(), nullptr,
                                     reinterpret_cast<SQLWCHAR *>(connection_string->data()),
                                     connection_string->size(), nullptr, 0, nullptr,
                                     SQL_DRIVER_NOPROMPT);

    if (!_errorHandler->CheckOdbcError(ret))
    {
      SQL_LOG_ERROR("SQLDriverConnect failed");
      return false;
    }

    connectionState = ConnectionOpen;
    return true;
  }
}