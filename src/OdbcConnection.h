#pragma once
#include <string>
#include <vector>
#include <memory>
#include <mutex>
#include <odbc_handles.h>
#include <odbc_common.h>

namespace mssql
{
    // Forward declarations
    class OdbcError;
    class OdbcStatementCache;
 
    // This class encapsulates the actual ODBC functionality
    class OdbcConnection {
    public:
        OdbcConnection();
        ~OdbcConnection();
        
        // Static method to initialize ODBC environment
        static bool InitializeEnvironment();
        
        // Open a connection to the database
        bool Open(const std::string& connectionString, int timeout = 0);
        
        // Close the connection
        bool Close();
        
        // Check if the connection is open
        bool IsConnected() const;
        
        // Begin a transaction
        bool BeginTransaction();
        
        // Commit a transaction
        bool CommitTransaction();
        
        // Rollback a transaction
        bool RollbackTransaction();
        
        // Get connection errors
        const std::vector<std::shared_ptr<OdbcError>>& GetErrors() const;
        
    private:
        // Connection state enum
        enum ConnectionState {
            ConnectionClosed,
            ConnectionOpen
        };
        
        // Connection state
        ConnectionState connectionState;
        
        // Static ODBC environment handle
        static OdbcEnvironmentHandle environment;
        
        // Connection handles
        std::shared_ptr<ConnectionHandles> _connectionHandles;
        
        // Statement cache
        std::shared_ptr<OdbcStatementCache> _statements;
        
        // Error collection
        std::shared_ptr<std::vector<std::shared_ptr<OdbcError>>> _errors;
        
        // Critical section for thread safety
        std::mutex _connectionMutex;
        
        // Helper methods
        bool TryClose();
        bool ReturnOdbcError();
        bool CheckOdbcError(SQLRETURN ret);
        SQLRETURN open_timeout(int timeout);
        bool try_open(std::shared_ptr<std::vector<uint16_t>> connection_string, int timeout);
        bool try_begin_tran();
        bool try_end_tran(SQLSMALLINT completion_type);
        
        // Convert UTF-8 connection string to UTF-16
        std::shared_ptr<std::vector<uint16_t>> ConvertConnectionString(const std::string& connectionString);
    };
    
    // Simple class to hold ODBC error information
    class OdbcError {
    public:
        OdbcError(const std::string& message, const std::string& state, int code)
            : message(message), state(state), code(code) {}
            
        std::string message;
        std::string state;
        int code;
    };
}