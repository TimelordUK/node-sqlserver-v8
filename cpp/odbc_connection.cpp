#include "odbc_connection.h"
#include "odbc_environment.h"
#include "odbc_statement_cache.h"
#include "odbc_handles.h"
#include "query_result.h"
#include <codecvt>
#include <locale>
#include <Logger.h>
#include <iostream>

namespace mssql
{

  // Initialize static member
  std::shared_ptr<IOdbcEnvironment> OdbcConnection::sharedEnvironment_;

  // OdbcConnection implementation
  OdbcConnection::OdbcConnection(std::shared_ptr<IOdbcEnvironment> environment)
      : connectionState(ConnectionState::ConnectionClosed)
  {
    _errors = std::make_shared<std::vector<std::shared_ptr<OdbcError>>>();

    // If environment is provided, use it, otherwise use shared environment
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
      // Create a new environment if none is provided and no shared environment exists
      environment_ = OdbcEnvironmentFactory::CreateEnvironment();
      if (!environment_->Initialize())
      {
        SQL_LOG_ERROR("Failed to initialize ODBC environment in constructor");
      }
    }
  }

  OdbcConnection::~OdbcConnection()
  {
    Close();
  }

  bool OdbcConnection::InitializeEnvironment()
  {
    SQL_LOG_INFO("Initializing shared ODBC environment");

    // Use double-checked locking pattern
    if (!sharedEnvironment_)
    {
      static std::mutex envMutex;
      std::lock_guard<std::mutex> lock(envMutex);

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
    // Convert UTF-8 to UTF-16
    std::wstring_convert<std::codecvt_utf8_utf16<char16_t>, char16_t> converter;
    std::u16string utf16 = converter.from_bytes(connectionString);

    // Create vector and copy data
    auto result = std::make_shared<std::vector<uint16_t>>(utf16.begin(), utf16.end());
    return result;
  }

  bool OdbcConnection::Open(const std::string &connectionString, int timeout)
  {
    SQL_LOG_INFO("Opening connection");
    SQL_LOG_DEBUG_STREAM("Connection string (partial): " << connectionString.substr(0, 30) << "...");

    std::lock_guard<std::mutex> lock(_connectionMutex);

    if (connectionState != ConnectionState::ConnectionClosed)
    {
      SQL_LOG_WARNING("Connection already open");
      _errors->push_back(std::make_shared<OdbcError>(
          "Connection is already open", "01000", 0));
      return false;
    }

    // Make sure environment is initialized
    if (!environment_->Initialize())
    {
      SQL_LOG_ERROR("Failed to initialize ODBC environment");
      environment_->ReadErrors(_errors);
      return false;
    }

    const auto wideConnStr = ConvertConnectionString(connectionString);
    const bool result = try_open(wideConnStr, timeout);

    if (result)
    {
      SQL_LOG_INFO("Connection successfully opened");
    }
    else
    {
      SQL_LOG_ERROR("Failed to open connection");
    }

    return result;
  }

  bool OdbcConnection::Close()
  {
    std::lock_guard<std::mutex> lock(_connectionMutex);
    return TryClose();
  }

  bool OdbcConnection::IsConnected() const
  {
    return connectionState == ConnectionState::ConnectionOpen;
  }

  bool OdbcConnection::BeginTransaction()
  {
    std::lock_guard<std::mutex> lock(_connectionMutex);
    if (connectionState != ConnectionState::ConnectionOpen)
    {
      _errors->push_back(std::make_shared<OdbcError>(
          "Connection is not open", "01000", 0));
      return false;
    }

    return try_begin_tran();
  }

  bool OdbcConnection::CommitTransaction()
  {
    std::lock_guard<std::mutex> lock(_connectionMutex);
    if (connectionState != ConnectionState::ConnectionOpen)
    {
      _errors->push_back(std::make_shared<OdbcError>(
          "Connection is not open", "01000", 0));
      return false;
    }

    return try_end_tran(SQL_COMMIT);
  }

  bool OdbcConnection::RollbackTransaction()
  {
    std::lock_guard<std::mutex> lock(_connectionMutex);
    if (connectionState != ConnectionState::ConnectionOpen)
    {
      _errors->push_back(std::make_shared<OdbcError>(
          "Connection is not open", "01000", 0));
      return false;
    }

    return try_end_tran(SQL_ROLLBACK);
  }

  const std::vector<std::shared_ptr<OdbcError>> &OdbcConnection::GetErrors() const
  {
    return *_errors;
  }

  bool OdbcConnection::TryClose()
  {
    if (connectionState != ConnectionState::ConnectionClosed)
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
          SQLDisconnect(connection->get_handle());
        }
        _connectionHandles->clear();
      }

      connectionState = ConnectionState::ConnectionClosed;
    }

    return true;
  }

  bool OdbcConnection::ReturnOdbcError()
  {
    _errors->clear();

    if (_connectionHandles)
    {
      const auto connection = _connectionHandles->connectionHandle();
      if (connection)
      {
        connection->read_errors(_errors);
      }
    }

    TryClose();
    return false;
  }

  bool OdbcConnection::CheckOdbcError(const SQLRETURN ret)
  {
    if (!SQL_SUCCEEDED(ret))
    {
      return ReturnOdbcError();
    }
    return true;
  }

  SQLRETURN OdbcConnection::open_timeout(const int timeout)
  {
    if (timeout > 0)
    {
      const auto connection = _connectionHandles->connectionHandle();
      if (!connection)
        return SQL_ERROR;

      auto *const to = reinterpret_cast<SQLPOINTER>(static_cast<long long>(timeout));

      // Set connection timeout
      auto ret = SQLSetConnectAttr(connection->get_handle(), SQL_ATTR_CONNECTION_TIMEOUT, to, 0);
      if (!SQL_SUCCEEDED(ret))
        return ret;

      // Set login timeout
      ret = SQLSetConnectAttr(connection->get_handle(), SQL_ATTR_LOGIN_TIMEOUT, to, 0);
      if (!SQL_SUCCEEDED(ret))
        return ret;
    }
    return SQL_SUCCESS;
  }

  bool OdbcConnection::try_open(std::shared_ptr<std::vector<uint16_t>> connection_string, const int timeout)
  {
    _errors->clear();
    // Use the environment handle from our environment_ object
    this->_connectionHandles = std::make_shared<ConnectionHandles>(environment_->GetEnvironmentHandle());

    // Get a pointer to the connection handle
    const auto connection = _connectionHandles->connectionHandle();
    if (connection == nullptr)
    {
      _errors->clear();
      environment_->ReadErrors(_errors);
      return false;
    }

    // Use the new statement cache creation with our interfaces
    _statements = std::make_shared<OdbcStatementCache>(_connectionHandles);
    auto ret = open_timeout(timeout);
    if (!CheckOdbcError(ret))
      return false;

    // Use get_handle() to access the ODBC handle
    ret = SQLSetConnectAttr(connection->get_handle(), SQL_COPT_SS_BCP,
                            reinterpret_cast<SQLPOINTER>(SQL_BCP_ON), SQL_IS_INTEGER);
    if (!CheckOdbcError(ret))
      return false;

    ret = SQLDriverConnect(connection->get_handle(), nullptr,
                           reinterpret_cast<SQLWCHAR *>(connection_string->data()),
                           connection_string->size(), nullptr, 0, nullptr,
                           SQL_DRIVER_NOPROMPT);

    if (!CheckOdbcError(ret))
      return false;
    connectionState = ConnectionState::ConnectionOpen;
    return true;
  }

  bool OdbcConnection::try_begin_tran()
  {
    // Turn off autocommit
    const auto connection = _connectionHandles->connectionHandle();
    if (!connection)
      return false;

    auto *const acoff = reinterpret_cast<SQLPOINTER>(SQL_AUTOCOMMIT_OFF);
    const auto ret = SQLSetConnectAttr(connection->get_handle(), SQL_ATTR_AUTOCOMMIT, acoff, SQL_IS_UINTEGER);
    return CheckOdbcError(ret);
  }

  bool OdbcConnection::try_end_tran(const SQLSMALLINT completion_type)
  {
    const auto connection = _connectionHandles->connectionHandle();
    if (!connection)
      return false;

    // End the transaction
    auto ret = SQLEndTran(SQL_HANDLE_DBC, connection->get_handle(), completion_type);
    if (!CheckOdbcError(ret))
      return false;

    // Put the connection back into auto commit mode
    auto *const acon = reinterpret_cast<SQLPOINTER>(SQL_AUTOCOMMIT_ON);
    ret = SQLSetConnectAttr(connection->get_handle(), SQL_ATTR_AUTOCOMMIT, acon, SQL_IS_UINTEGER);
    return CheckOdbcError(ret);
  }

  bool OdbcConnection::ExecuteQuery(
      const std::string &sqlText,
      const std::vector<std::shared_ptr<QueryParameter>> &parameters,
      std::shared_ptr<QueryResult> &result)
  {
    SQL_LOG_INFO("Executing query");
    SQL_LOG_DEBUG_STREAM("SQL: " << sqlText);
    SQL_LOG_DEBUG_STREAM("Parameter count: " << parameters.size());

    std::lock_guard<std::mutex> lock(_connectionMutex);

    if (connectionState != ConnectionState::ConnectionOpen)
    {
      _errors->push_back(std::make_shared<OdbcError>(
          "Connection is not open", "01000", 0));
      return false;
    }

    // Create a statement using our factory method
    auto stmt = create_statement_handle();
    if (!stmt->alloc(_connectionHandles->connectionHandle()->get_handle()))
    {
      return ReturnOdbcError();
    }

    // Prepare the statement
    auto wideQuery = ConvertConnectionString(sqlText); // Reuse your string conversion
    auto ret = SQLPrepare(stmt->get_handle(),
                          reinterpret_cast<SQLWCHAR *>(wideQuery->data()),
                          static_cast<SQLINTEGER>(wideQuery->size()));

    if (!CheckOdbcError(ret))
      return false;

    // Bind parameters
    for (size_t i = 0; i < parameters.size(); i++)
    {
      // Bind each parameter based on type
      // This would be complex and depend on your parameter handling
      // ...
    }

    // Execute the query
    ret = SQLExecute(stmt->get_handle());
    if (!CheckOdbcError(ret))
      return false;

    // Process results
    // Get column information
    SQLSMALLINT numCols = 0;
    SQLNumResultCols(stmt->get_handle(), &numCols);

    // For each column, get name and type
    for (SQLSMALLINT i = 1; i <= numCols; i++)
    {
      SQLWCHAR colName[256];
      SQLSMALLINT colNameLen;
      SQLSMALLINT dataType;

      SQLDescribeCol(stmt->get_handle(), i, colName, sizeof(colName) / sizeof(SQLWCHAR),
                     &colNameLen, &dataType, NULL, NULL, NULL);

      // Convert to string using your conversion utilities
      std::string colNameStr = odbcstr::swcvec2str(
          std::vector<SQLWCHAR>(colName, colName + colNameLen),
          colNameLen);

      result->addColumn(colNameStr, dataType);
    }

    // Fetch rows
    while (SQL_SUCCEEDED(SQLFetch(stmt->get_handle())))
    {
      std::vector<std::string> rowData;

      for (SQLSMALLINT i = 1; i <= numCols; i++)
      {
        // Get data for each column
        SQLWCHAR buffer[4096];
        SQLLEN indicator;

        ret = SQLGetData(stmt->get_handle(), i, SQL_C_WCHAR, buffer, sizeof(buffer), &indicator);

        if (SQL_SUCCEEDED(ret))
        {
          if (indicator == SQL_NULL_DATA)
          {
            rowData.emplace_back("NULL");
          }
          else
          {
            // Convert to string
            std::string value = odbcstr::swcvec2str(
                std::vector<SQLWCHAR>(buffer, buffer + (indicator / sizeof(SQLWCHAR))),
                indicator / sizeof(SQLWCHAR));
            rowData.push_back(value);
          }
        }
        else
        {
          rowData.emplace_back("ERROR");
        }
      }

      result->addRow(rowData);
    }
    return true;
  } // namespace mssql
}