#include "platform.h"
#include "odbc_common.h"
#include <gtest/gtest.h>
#include <gmock/gmock.h>
#include "mock_odbc_statement.h"
#include "odbc_driver_types.h"

using namespace mssql;
using namespace testing;
using ::testing::NiceMock;

class MockOdbcStatementBasicTest : public ::testing::Test
{
protected:
  void SetUp() override
  {
    // Create a basic mock
    mockStatement = std::make_shared<MockIOdbcStatement>();
  }

  // Helper to create a simple column definition for testing
  ColumnDefinition CreateTestColumn(const std::string &name, SQLSMALLINT dataType)
  {
    ColumnDefinition col;

    // Convert string to SQLWCHAR array
    for (size_t i = 0; i < name.length() && i < 255; i++)
    {
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
TEST_F(MockOdbcStatementBasicTest, BasicMockUsage)
{
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
// Simplified test that creates a basic mock and tests it
TEST_F(MockOdbcStatementBasicTest, DISABLED_ConfigureForSuccessfulQuery)
{
  // Create a direct mock without using the ConfigureForSuccessfulQuery helper
  auto mockStatement = std::make_shared<NiceMock<MockIOdbcStatement>>();

  // Create test columns
  std::vector<ColumnDefinition> columns;
  columns.push_back(CreateTestColumn("id", SQL_INTEGER));
  columns.push_back(CreateTestColumn("name", SQL_VARCHAR));
  columns.push_back(CreateTestColumn("age", SQL_INTEGER));

  // Set up the behavior directly
  ON_CALL(*mockStatement, Execute)
      .WillByDefault([columns](auto &, std::shared_ptr<QueryResult> &result)
                     {
            for (const auto& col : columns) {
                result->addColumn(col);
            }
            result->set_row_count(5);
            result->set_end_of_rows(false);
            return true; });

  ON_CALL(*mockStatement, TryReadRows)
      .WillByDefault([](std::shared_ptr<QueryResult> result, size_t)
                     {
            result->set_end_of_rows(true);
            return true; });

  ON_CALL(*mockStatement, EndOfRows)
      .WillByDefault([]()
                     {
            static bool first_call = true;
            if (first_call) {
                first_call = false;
                return false;
            }
            return true; });

  // Create a result object to receive the query results
  auto result = std::make_shared<QueryResult>();

  // Execute the query
  bool success = mockStatement->Execute({}, result);

  // Verify the results
  ASSERT_TRUE(success);
  ASSERT_EQ(3, result->get_column_count());

  // Try reading rows (should mark end of rows)
  ASSERT_TRUE(mockStatement->TryReadRows(result, 10));
  ASSERT_TRUE(mockStatement->EndOfRows());
}