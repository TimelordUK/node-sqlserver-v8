#pragma once

#include "odbc_api.h"  // Include the IOdbcApi interface
#include <gmock/gmock.h>
#include <gtest/gtest.h>

namespace mssql {

/**
 * Google Mock implementation of the ODBC API interface
 * This allows for precise control over ODBC behavior in tests
 */
#pragma once

#include "odbc_api.h"
#include <gmock/gmock.h>
#include <gtest/gtest.h>

namespace mssql {

/**
 * Google Mock implementation of the ODBC API interface
 */
class MockOdbcApi : public IOdbcApi {
public:
    // Mock the methods
    MOCK_METHOD(SQLRETURN, SQLSetEnvAttr, 
                (SQLHENV environmentHandle, 
                 SQLINTEGER attribute, 
                 SQLPOINTER value, 
                 SQLINTEGER stringLength), (override));
    
    MOCK_METHOD(SQLRETURN, SQLAllocHandle,
                (SQLSMALLINT handleType,
                 SQLHANDLE inputHandle,
                 SQLHANDLE* outputHandle), (override));
    
    // Mock other methods...
    
    // Helper methods for setting up common test scenarios
    void SetupSuccessfulConnection() {
        using ::testing::_;
        using ::testing::Return;
        using ::testing::DoAll;
        using ::testing::SetArgPointee;
        
        // Setup expectations...
    }
};

} // namespace mssql