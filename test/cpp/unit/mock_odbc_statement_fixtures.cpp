#include <gtest/gtest.h>
#include <gmock/gmock.h>
#include "mock_odbc_statement.h"
#include "odbc_connection.h"
#include "query_result.h"
#include "odbc_error_handler.h"

using namespace mssql;
using namespace testing;

// This test suite tests the mock fixture implementation itself, not the actual implementation
// This allows us to focus on testing the mock's behavior rather than the real implementation

class MockStatementFixtureTest : public ::testing::Test {
protected:
    void SetUp() override {
        // Setup mock dependencies
        mockOdbcApi = std::make_shared<MockOdbcApi>();
        mockErrorHandler = std::make_shared<MockOdbcErrorHandler>();
        mockStmtHandle = std::make_shared<MockOdbcStatementHandle>();
        
        // Configure the mock handle to return a fake SQLHSTMT
        fakeHandle = reinterpret_cast<SQLHSTMT>(0x12345678);
        EXPECT_CALL(*mockStmtHandle, get_handle())
            .WillRepeatedly(Return(fakeHandle));
            
        // Configure error handler to accept successful operations
        EXPECT_CALL(*mockErrorHandler, CheckOdbcError(_))
            .WillRepeatedly(Return(true));
    }
    
    // Helper method to create a test column definition
    ColumnDefinition CreateTestColumn(const std::string& name, SQLSMALLINT dataType) {
        ColumnDefinition col{};
        
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
    
    std::shared_ptr<MockOdbcApi> mockOdbcApi;
    std::shared_ptr<MockOdbcErrorHandler> mockErrorHandler;
    std::shared_ptr<MockOdbcStatementHandle> mockStmtHandle;
    SQLHSTMT fakeHandle;
};

// Test for PreparedStatement mock with basic employee data
TEST_F(MockStatementFixtureTest, PreparedStatementMock) {
    // Create a mock IOdbcStatement
    auto mockStatement = std::make_shared<MockIOdbcStatement>();
    
    // Create test columns for employee data
    std::vector<ColumnDefinition> columns;
    columns.push_back(CreateTestColumn("id", SQL_INTEGER));
    columns.push_back(CreateTestColumn("name", SQL_VARCHAR));
    columns.push_back(CreateTestColumn("department", SQL_VARCHAR));
    columns.push_back(CreateTestColumn("salary", SQL_DECIMAL));
    
    // Configure the mock
    EXPECT_CALL(*mockStatement, GetType())
        .WillRepeatedly(Return(StatementType::Prepared));
        
    EXPECT_CALL(*mockStatement, Execute(_, _))
        .WillOnce(testing::DoAll(
            testing::Invoke([columns](auto&, std::shared_ptr<QueryResult>& result) {
                for (const auto& col : columns) {
                    result->addColumn(col);
                }
                result->set_row_count(10);
                result->set_end_of_rows(false);
                return true;
            }),
            testing::Return(true)));
            
    // Verify the mock behavior
    auto result = std::make_shared<QueryResult>();
    bool success = mockStatement->Execute({}, result);
    
    ASSERT_TRUE(success);
    ASSERT_EQ(4, result->get_column_count());
    
    // Manually check each character in the column name
    std::string expected = "id";
    ASSERT_EQ(expected.length(), result->get(0).colNameLen);
    for (int i = 0; i < result->get(0).colNameLen; i++) {
        ASSERT_EQ(expected[i], static_cast<char>(result->get(0).colName[i]));
    }
    
    // Verify the column types
    ASSERT_EQ(SQL_INTEGER, result->get(0).dataType);
    ASSERT_EQ(SQL_VARCHAR, result->get(1).dataType);
    ASSERT_EQ(SQL_VARCHAR, result->get(2).dataType);
    ASSERT_EQ(SQL_DECIMAL, result->get(3).dataType);
}

// Test for TvpStatement mock with product data
TEST_F(MockStatementFixtureTest, TvpStatementMock) {
    // Create a mock IOdbcStatement
    auto mockStatement = std::make_shared<MockIOdbcStatement>();
    
    // Create test columns for product data
    std::vector<ColumnDefinition> columns;
    columns.push_back(CreateTestColumn("product_id", SQL_INTEGER));
    columns.push_back(CreateTestColumn("name", SQL_VARCHAR));
    columns.push_back(CreateTestColumn("price", SQL_DECIMAL));
    columns.push_back(CreateTestColumn("category", SQL_VARCHAR));
    columns.push_back(CreateTestColumn("in_stock", SQL_BIT));
    
    // Configure the mock
    EXPECT_CALL(*mockStatement, GetType())
        .WillRepeatedly(Return(StatementType::TVP));
        
    EXPECT_CALL(*mockStatement, Execute(_, _))
        .WillOnce(testing::DoAll(
            testing::Invoke([columns](auto&, std::shared_ptr<QueryResult>& result) {
                for (const auto& col : columns) {
                    result->addColumn(col);
                }
                result->set_row_count(5);
                result->set_end_of_rows(false);
                return true;
            }),
            testing::Return(true)));
            
    // Verify the mock behavior
    auto result = std::make_shared<QueryResult>();
    bool success = mockStatement->Execute({}, result);
    
    ASSERT_TRUE(success);
    ASSERT_EQ(5, result->get_column_count());
    
    // Verify column names
    std::string expected = "product_id";
    ASSERT_EQ(expected.length(), result->get(0).colNameLen);
    for (int i = 0; i < result->get(0).colNameLen; i++) {
        ASSERT_EQ(expected[i], static_cast<char>(result->get(0).colName[i]));
    }
    
    // Verify the column types
    ASSERT_EQ(SQL_INTEGER, result->get(0).dataType);
    ASSERT_EQ(SQL_VARCHAR, result->get(1).dataType);
    ASSERT_EQ(SQL_DECIMAL, result->get(2).dataType);
    ASSERT_EQ(SQL_VARCHAR, result->get(3).dataType);
    ASSERT_EQ(SQL_BIT, result->get(4).dataType);
}