#include <gtest/gtest.h>
#include <gmock/gmock.h>
#include "mock_odbc_statement.h"
#include "odbc_driver_types.h"

using namespace mssql;
using namespace testing;

class MockOdbcStatementBasicTest : public ::testing::Test {
protected:
    void SetUp() override {
        // Create a basic mock
        mockStatement = std::make_shared<MockIOdbcStatement>();
    }

    // Helper to create a simple column definition for testing
    ColumnDefinition CreateTestColumn(const std::string& name, SQLSMALLINT dataType) {
        ColumnDefinition col;
        
        // Convert string to SQLWCHAR array
        for (size_t i = 0; i < name.length() && i < 255; i++) {
            col.colName[i] = static_cast<SQLWCHAR>(name[i]);
        }
        col.colName[name.length()] = 0;
        col.colNameLen = static_cast<SQLSMALLINT>(name.length());
        
        col.dataType = dataType;
        col.columnSize = 100;
        col.decimalDigits = 0;
        col.nullable = SQL_NULLABLE;
        
        return col;
    }

    std::shared_ptr<MockIOdbcStatement> mockStatement;
};

// Test that demonstrates how to set up basic expectations on the mock
TEST_F(MockOdbcStatementBasicTest, BasicMockUsage) {
    // Set up expectations
    EXPECT_CALL(*mockStatement, GetType())
        .WillOnce(Return(StatementType::Prepared));
    
    EXPECT_CALL(*mockStatement, GetState())
        .WillOnce(Return(StatementState::STMT_INITIAL));
    
    EXPECT_CALL(*mockStatement, IsNumericStringEnabled())
        .WillOnce(Return(true));
    
    // Verify behavior
    ASSERT_EQ(StatementType::Prepared, mockStatement->GetType());
    ASSERT_EQ(StatementState::STMT_INITIAL, mockStatement->GetState());
    ASSERT_TRUE(mockStatement->IsNumericStringEnabled());
}

// Test that demonstrates the ConfigureForSuccessfulQuery helper method
TEST_F(MockOdbcStatementBasicTest, ConfigureForSuccessfulQuery) {
    // Create test columns
    std::vector<ColumnDefinition> columns;
    columns.push_back(CreateTestColumn("id", SQL_INTEGER));
    columns.push_back(CreateTestColumn("name", SQL_VARCHAR));
    columns.push_back(CreateTestColumn("age", SQL_INTEGER));
    
    // Configure the mock for a successful query
    mockStatement->ConfigureForSuccessfulQuery(columns, 5);
    
    // Create a result object to receive the query results
    auto result = std::make_shared<QueryResult>();
    
    // Execute the query (this should use our configured mock behavior)
    bool success = mockStatement->Execute({}, result);
    
    // Verify the results
    ASSERT_TRUE(success);
    ASSERT_EQ(3, result->get_column_count());
    
    // Try reading rows (should mark end of rows)
    ASSERT_TRUE(mockStatement->TryReadRows(result, 10));
    ASSERT_TRUE(mockStatement->EndOfRows());
}