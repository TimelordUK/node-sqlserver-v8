// ReSharper disable CppInconsistentNaming
#include "odbc_connection.h"
#include "odbc_environment.h"
#include "odbc_statement_cache.h"
#include "odbc_handles.h"
#include "query_result.h"
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
      // Initialize components after successful connection
      _transactionManager = std::make_shared<OdbcTransactionManager>(_connectionHandles);
      _queryExecutor = std::make_shared<OdbcQueryExecutor>(_connectionHandles, _errorHandler);
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
    return TryClose();
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

  const std::vector<std::shared_ptr<OdbcError>> &OdbcConnection::GetErrors() const
  {
    return _errorHandler->GetErrors();
  }

  bool OdbcConnection::TryClose()
  {
    SQL_LOG_DEBUG("TryClose");
    if (connectionState != ConnectionClosed)
    {
      if (_statements)
      {
        _statements->clear();
      }

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

      // Clear component references
      _transactionManager.reset();
      _queryExecutor.reset();
    }

    return true;
  }

  SQLRETURN OdbcConnection::open_timeout(const int timeout)
  {
    if (timeout > 0)
    {
      const auto connection = _connectionHandles->connectionHandle();
      if (!connection)
      {
        SQL_LOG_ERROR("Connection handle is null");
        return SQL_ERROR;
      }

      auto *const to = reinterpret_cast<SQLPOINTER>(static_cast<long long>(timeout));

      // Set connection timeout
      auto ret = _odbcApi->SQLSetConnectAttr(connection->get_handle(), SQL_ATTR_CONNECTION_TIMEOUT, to, 0);
      if (!SQL_SUCCEEDED(ret))
      {
        SQL_LOG_ERROR("Failed to set connection timeout SQL_ATTR_CONNECTION_TIMEOUT");
        return ret;
      }

      // Set login timeout
      ret = _odbcApi->SQLSetConnectAttr(connection->get_handle(), SQL_ATTR_LOGIN_TIMEOUT, to, 0);
      if (!SQL_SUCCEEDED(ret))
      {
        SQL_LOG_ERROR("Failed to set connection timeout SQL_ATTR_LOGIN_TIMEOUT");
        return ret;
      }
    }
    return SQL_SUCCESS;
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

    _statements = std::make_shared<OdbcStatementCache>(_connectionHandles);
    auto ret = open_timeout(timeout);
    if (!_errorHandler->CheckOdbcError(ret))
    {
      SQL_LOG_ERROR("Failed to open connection with timeout");
      return false;
    }

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

  bool OdbcConnection::ExecuteQuery(
      const std::string &sqlText,
      const std::vector<std::shared_ptr<QueryParameter>> &parameters,
      std::shared_ptr<QueryResult> &result)
  {
    std::lock_guard lock(_connectionMutex);

    if (connectionState != ConnectionOpen)
    {
      return false;
    }

    return _queryExecutor->ExecuteQuery(sqlText, parameters, result);
  }
}