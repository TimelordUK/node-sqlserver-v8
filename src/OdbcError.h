#pragma once

#include <string>

namespace mssql {
    // Class to represent ODBC errors
    class OdbcError {
    public:
        OdbcError(
            const std::string& message,
            const std::string& state,
            int code
        ) : message(message), state(state), code(code) {}
        
        // Error message
        std::string message;
        
        // SQLSTATE
        std::string state;
        
        // Native error code
        int code;
    };
}