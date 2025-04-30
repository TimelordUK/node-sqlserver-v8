#include "odbc_environment.h"
#include <Logger.h>

namespace mssql {

OdbcEnvironment::OdbcEnvironment() {
    // Environment handle is initialized but not allocated yet
}

OdbcEnvironment::~OdbcEnvironment() {
    // The environment handle will be freed automatically
}

bool OdbcEnvironment::Initialize() {
    SQL_LOG_INFO("Initializing ODBC environment");
    
    // Set up connection pooling
    auto ret = SQLSetEnvAttr(nullptr, SQL_ATTR_CONNECTION_POOLING,
                          reinterpret_cast<SQLPOINTER>(SQL_CP_ONE_PER_HENV), 0);
    if (!SQL_SUCCEEDED(ret)) { 
        SQL_LOG_ERROR("Failed to set connection pooling attribute");
        return false; 
    }

    // Allocate environment handle
    if (!environment_.alloc()) { 
        SQL_LOG_ERROR("Failed to allocate environment handle");
        return false; 
    }

    // Set ODBC version
    ret = SQLSetEnvAttr(environment_, SQL_ATTR_ODBC_VERSION, 
                       reinterpret_cast<SQLPOINTER>(SQL_OV_ODBC3), 0);
    if (!SQL_SUCCEEDED(ret)) { 
        SQL_LOG_ERROR("Failed to set ODBC version");
        return false; 
    }
    
    // Set connection pooling match
    ret = SQLSetEnvAttr(environment_, SQL_ATTR_CP_MATCH, 
                       reinterpret_cast<SQLPOINTER>(SQL_CP_RELAXED_MATCH), 0);
    if (!SQL_SUCCEEDED(ret)) { 
        SQL_LOG_ERROR("Failed to set connection pooling match");
        return false; 
    }

    SQL_LOG_INFO("ODBC environment successfully initialized");
    return true;
}

OdbcEnvironmentHandle& OdbcEnvironment::GetEnvironmentHandle() {
    return environment_;
}

void OdbcEnvironment::ReadErrors(std::shared_ptr<std::vector<std::shared_ptr<OdbcError>>> errors) {
    environment_.read_errors(errors);
}

// Factory implementation
std::shared_ptr<IOdbcEnvironment> OdbcEnvironmentFactory::CreateEnvironment() {
    return std::make_shared<OdbcEnvironment>();
}

} // namespace mssql