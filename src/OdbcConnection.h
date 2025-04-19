#pragma once
#include <string>

namespace mssql
{
    // This class encapsulates the actual ODBC functionality
    // separating it from Node.js-specific code
    class OdbcConnection {
    public:
        OdbcConnection();
        ~OdbcConnection();

        // Open a connection to the database
        bool Open(const std::string& connectionString, std::string& errorMessage);

        // Close the connection
        bool Close(std::string& errorMessage);

        // Check if the connection is open
        bool IsConnected() const;

    private:
        // Handle to the ODBC connection
        void* connectionHandle_ = nullptr;

        // Connection state
        bool isConnected_ = false;
    };
}