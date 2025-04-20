#include <platform.h>
#include <odbc_common.h>
#include <odbc_handles.h>
#include "Connection.h"
#include "OdbcConnection.h"
#include <codecvt>
#include <locale>
#include <Logger.h>
#include <iostream>

// For demonstration purposes, we'll define simplified versions of the supporting classes
// In a real implementation, you would have proper implementations of these classes
namespace mssql {
    
  
    
    // Simplified OdbcStatementCache
    class OdbcStatementCache {
    public:
        OdbcStatementCache(std::shared_ptr<ConnectionHandles> handles) 
            : connectionHandles(handles) {
        }
        
        void clear() {
            // Clear any cached statements
        }
        
    private:
        std::shared_ptr<ConnectionHandles> connectionHandles;
    };
    
    // Initialize static members
    OdbcEnvironmentHandle OdbcConnection::environment;
    
    // OdbcConnection implementation
    OdbcConnection::OdbcConnection()
        : connectionState( ConnectionState::ConnectionClosed)
    {
        _errors = std::make_shared<std::vector<std::shared_ptr<OdbcError>>>();
    }
    
    OdbcConnection::~OdbcConnection()
    {
        Close();
    }
    
    class OdbcEnvironmentManager {
    public:
        static std::shared_ptr<OdbcEnvironmentHandle> getEnvironment() {
            std::lock_guard<std::mutex> lock(mutex_);

            if (!environment_) {
                auto env = std::make_shared<OdbcEnvironmentHandle>();
                if (!env->alloc()) {
                    return nullptr;
                }

                // Configure environment
                SQLSetEnvAttr(*env, SQL_ATTR_ODBC_VERSION,
                    reinterpret_cast<SQLPOINTER>(SQL_OV_ODBC3), 0);
                SQLSetEnvAttr(*env, SQL_ATTR_CONNECTION_POOLING,
                    reinterpret_cast<SQLPOINTER>(SQL_CP_ONE_PER_HENV), 0);

                environment_ = env;
            }

            return environment_;
        }

        static void releaseEnvironment() {
            std::lock_guard<std::mutex> lock(mutex_);
            environment_.reset();
        }

    private:
        static std::mutex mutex_;
        static std::shared_ptr<OdbcEnvironmentHandle> environment_;
    };


    bool OdbcConnection::InitializeEnvironment()
    {
        // Set up connection pooling
        auto ret = SQLSetEnvAttr(nullptr, SQL_ATTR_CONNECTION_POOLING,
                              reinterpret_cast<SQLPOINTER>(SQL_CP_ONE_PER_HENV), 0);
        if (!SQL_SUCCEEDED(ret)) { return false; }

        // Allocate environment handle
        if (!environment.alloc()) { return false; }

        // Set ODBC version
        ret = SQLSetEnvAttr(environment, SQL_ATTR_ODBC_VERSION, 
                           reinterpret_cast<SQLPOINTER>(SQL_OV_ODBC3), 0);
        if (!SQL_SUCCEEDED(ret)) { return false; }
        
        // Set connection pooling match
        ret = SQLSetEnvAttr(environment, SQL_ATTR_CP_MATCH, 
                           reinterpret_cast<SQLPOINTER>(SQL_CP_RELAXED_MATCH), 0);
        if (!SQL_SUCCEEDED(ret)) { return false; }

        return true;
    }
    
    std::shared_ptr<std::vector<uint16_t>> OdbcConnection::ConvertConnectionString(
        const std::string& connectionString)
    {
        // Convert UTF-8 to UTF-16
        std::wstring_convert<std::codecvt_utf8_utf16<char16_t>, char16_t> converter;
        std::u16string utf16 = converter.from_bytes(connectionString);
        
        // Create vector and copy data
        auto result = std::make_shared<std::vector<uint16_t>>(utf16.begin(), utf16.end());
        return result;
    }
    
    bool OdbcConnection::Open(const std::string& connectionString, int timeout)
    {
        SQL_LOG_INFO("Opening connection");
        SQL_LOG_DEBUG_STREAM("Connection string (partial): " << connectionString.substr(0, 30) << "...");

        std::lock_guard<std::mutex> lock(_connectionMutex);

        if (connectionState != ConnectionState::ConnectionClosed) {
            SQL_LOG_WARNING("Connection already open");
            _errors->push_back(std::make_shared<OdbcError>(
                "Connection is already open", "01000", 0));
            return false;
        }

        auto wideConnStr = ConvertConnectionString(connectionString);
        bool result = try_open(wideConnStr, timeout);

        if (result) {
            SQL_LOG_INFO("Connection successfully opened");
        }
        else {
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
        if (connectionState !=  ConnectionState::ConnectionOpen) {
            _errors->push_back(std::make_shared<OdbcError>(
                "Connection is not open", "01000", 0));
            return false;
        }
        
        return try_begin_tran();
    }
    
    bool OdbcConnection::CommitTransaction()
    {
        std::lock_guard<std::mutex> lock(_connectionMutex);
        if (connectionState !=  ConnectionState::ConnectionOpen) {
            _errors->push_back(std::make_shared<OdbcError>(
                "Connection is not open", "01000", 0));
            return false;
        }
        
        return try_end_tran(SQL_COMMIT);
    }
    
    bool OdbcConnection::RollbackTransaction()
    {
        std::lock_guard<std::mutex> lock(_connectionMutex);
        if (connectionState !=  ConnectionState::ConnectionOpen) {
            _errors->push_back(std::make_shared<OdbcError>(
                "Connection is not open", "01000", 0));
            return false;
        }
        
        return try_end_tran(SQL_ROLLBACK);
    }
    
    const std::vector<std::shared_ptr<OdbcError>>& OdbcConnection::GetErrors() const
    {
        return *_errors;
    }
    
    bool OdbcConnection::TryClose()
    {
        if (connectionState !=  ConnectionState::ConnectionClosed)
        {
            if (_statements) {
                _statements->clear();
            }
            
            if (_connectionHandles) {
                auto connection = _connectionHandles->connectionHandle();
                if (connection) {
                    SQLDisconnect(*connection);
                }
                _connectionHandles->clear();
            }
            
            connectionState =  ConnectionState::ConnectionClosed;
        }

        return true;
    }
    
    bool OdbcConnection::ReturnOdbcError()
    {
        _errors->clear();
        
        if (_connectionHandles) {
            auto connection = _connectionHandles->connectionHandle();
            if (connection) {
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
            auto connection = _connectionHandles->connectionHandle();
            if (!connection) return SQL_ERROR;
            
            auto* const to = reinterpret_cast<SQLPOINTER>(static_cast<long long>(timeout));
            
            // Set connection timeout
            auto ret = SQLSetConnectAttr(*connection, SQL_ATTR_CONNECTION_TIMEOUT, to, 0);
            if (!SQL_SUCCEEDED(ret)) return ret;
            
            // Set login timeout
            ret = SQLSetConnectAttr(*connection, SQL_ATTR_LOGIN_TIMEOUT, to, 0);
            if (!SQL_SUCCEEDED(ret)) return ret;
        }
        return SQL_SUCCESS;
    }
    
    // In OdbcConnection.cpp:

    bool OdbcConnection::try_open(std::shared_ptr<std::vector<uint16_t>> connection_string, const int timeout)
    {
        _errors->clear();
        this->_connectionHandles = std::make_shared<ConnectionHandles>(environment);

        // Get a pointer to the connection handle instead of trying to copy it
        auto connection = _connectionHandles->connectionHandle();
        if (connection == nullptr)
        {
            _errors->clear();
            environment.read_errors(_errors);
            environment.free();
            return false;
        }

        // Use the pointer directly instead of dereferencing
        _statements = make_shared<OdbcStatementCache>(_connectionHandles);
        auto ret = open_timeout(timeout);
        if (!CheckOdbcError(ret)) return false;

        // Use the pointer directly
        ret = SQLSetConnectAttr(*connection, SQL_COPT_SS_BCP,
            reinterpret_cast<SQLPOINTER>(SQL_BCP_ON), SQL_IS_INTEGER);
        if (!CheckOdbcError(ret)) return false;

        ret = SQLDriverConnect(*connection, nullptr,
            reinterpret_cast<SQLWCHAR*>(connection_string->data()),
            connection_string->size(), nullptr, 0, nullptr,
            SQL_DRIVER_NOPROMPT);

        if (!CheckOdbcError(ret)) return false;
        connectionState = ConnectionState::ConnectionOpen;
        return true;
    }
    
    bool OdbcConnection::try_begin_tran()
    {
        // Turn off autocommit
        auto connection = _connectionHandles->connectionHandle();
        if (!connection) return false;
        
        auto* const acoff = reinterpret_cast<SQLPOINTER>(SQL_AUTOCOMMIT_OFF);
        auto ret = SQLSetConnectAttr(*connection, SQL_ATTR_AUTOCOMMIT, acoff, SQL_IS_UINTEGER);
        return CheckOdbcError(ret);
    }
    
    bool OdbcConnection::try_end_tran(const SQLSMALLINT completion_type)
    {
        auto connection = _connectionHandles->connectionHandle();
        if (!connection) return false;
        
        // End the transaction
        auto ret = SQLEndTran(SQL_HANDLE_DBC, *connection, completion_type);
        if (!CheckOdbcError(ret)) return false;
        
        // Put the connection back into auto commit mode
        auto* const acon = reinterpret_cast<SQLPOINTER>(SQL_AUTOCOMMIT_ON);
        ret = SQLSetConnectAttr(*connection, SQL_ATTR_AUTOCOMMIT, acon, SQL_IS_UINTEGER);
        return CheckOdbcError(ret);
    }

    bool OdbcConnection::ExecuteQuery(
        const std::string& sqlText, 
        const std::vector<std::shared_ptr<QueryParameter>>& parameters,
        std::shared_ptr<QueryResult>& result)
    {
        SQL_LOG_INFO("Executing query");
        SQL_LOG_DEBUG_STREAM(true, "SQL: " << sqlText);
        SQL_LOG_DEBUG_STREAM("Parameter count: " << parameters.size());

        std::lock_guard<std::mutex> lock(_connectionMutex);
        
        if (connectionState != ConnectionState::ConnectionOpen) {
            _errors->push_back(std::make_shared<OdbcError>(
                "Connection is not open", "01000", 0));
            return false;
        }
        
        // Create a statement
        OdbcStatementHandle stmt;
        if (!stmt.alloc(*_connectionHandles->connectionHandle())) {
            return ReturnOdbcError();
        }
        
        // Prepare the statement
        auto wideQuery = ConvertConnectionString(sqlText); // Reuse your string conversion
        auto ret = SQLPrepare(stmt, 
            reinterpret_cast<SQLWCHAR*>(wideQuery->data()), 
            static_cast<SQLINTEGER>(wideQuery->size()));
        
        if (!CheckOdbcError(ret)) return false;
        
        // Bind parameters
        for (size_t i = 0; i < parameters.size(); i++) {
            // Bind each parameter based on type
            // This would be complex and depend on your parameter handling
            // ...
        }
        
        // Execute the query
        ret = SQLExecute(stmt);
        if (!CheckOdbcError(ret)) return false;
        
        // Process results
        // Get column information
        SQLSMALLINT numCols = 0;
        SQLNumResultCols(stmt, &numCols);
        
        // For each column, get name and type
        for (SQLSMALLINT i = 1; i <= numCols; i++) {
            SQLWCHAR colName[256];
            SQLSMALLINT colNameLen;
            SQLSMALLINT dataType;
            
            SQLDescribeCol(stmt, i, colName, sizeof(colName)/sizeof(SQLWCHAR), 
                &colNameLen, &dataType, NULL, NULL, NULL);
                
            // Convert to string using your conversion utilities
            std::string colNameStr = odbcstr::swcvec2str(
                std::vector<SQLWCHAR>(colName, colName + colNameLen),
                colNameLen);
                
            result->addColumn(colNameStr, dataType);
        }
        
        // Fetch rows
        while (SQL_SUCCEEDED(SQLFetch(stmt))) {
            std::vector<std::string> rowData;
            
            for (SQLSMALLINT i = 1; i <= numCols; i++) {
                // Get data for each column
                SQLWCHAR buffer[4096];
                SQLLEN indicator;
                
                ret = SQLGetData(stmt, i, SQL_C_WCHAR, buffer, sizeof(buffer), &indicator);
                
                if (SQL_SUCCEEDED(ret)) {
                    if (indicator == SQL_NULL_DATA) {
                        rowData.push_back("NULL");
                    } else {
                        // Convert to string
                        std::string value = odbcstr::swcvec2str(
                            std::vector<SQLWCHAR>(buffer, buffer + (indicator/sizeof(SQLWCHAR))),
                            indicator/sizeof(SQLWCHAR));
                        rowData.push_back(value);
                    }
                } else {
                    rowData.push_back("ERROR");
                }
            }
            
            result->addRow(rowData);
        }
        
        return true;
    }
}