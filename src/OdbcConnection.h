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
    

    class OdbcError
    {
    public:

        OdbcError( const char* sqlstate, const char* message, SQLINTEGER code, 
                    const int severity, const char* serverName, const char* procName, const unsigned int lineNumber 
        )
           : sqlstate( sqlstate ), message(message), code(code), 
                severity(severity), serverName(serverName), procName(procName), lineNumber(lineNumber)
        {
        }

        OdbcError(const std::string& message, const std::string& sqlstate, int code)
        : message(message), sqlstate(sqlstate), code(code), severity(0), serverName(""), procName(""), lineNumber(0) {}

        const char* Message( void ) const
        {
            return message.c_str();
        }

        const char* SqlState( void ) const
        {
            return sqlstate.c_str();
        }

        SQLINTEGER Code( void ) const
        {
            return code;
        }
        
        int Severity( void ) const
        {
            return severity;
        }

        const char* ServerName( void ) const
        {
            return serverName.c_str();
        }

        const char* ProcName( void ) const
        {
            return procName.c_str();
        }

        unsigned int LineNumber( void ) const
        {
            return lineNumber;
        }

        // list of msnodesql specific errors
        static OdbcError NODE_SQL_NO_DATA;

        string sqlstate;
        string message; 
        SQLINTEGER code;
        int severity;
        string serverName;
        string procName;
        unsigned int lineNumber;
    };

}