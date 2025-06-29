#include "platform.h"
#include "odbc_common.h"
#include <gtest/gtest.h>
#include <gmock/gmock.h>
#include "mock_odbc_statement.h"
#include "odbc_connection.h"
#include "query_result.h"
#include "odbc_error_handler.h"

using namespace mssql;
using namespace testing;

class MockOdbcStatementTest : public ::testing::Test
{
protected:
  void SetUp() override
  {
    // Setup common test dependencies
    odbcApi = std::make_shared<MockOdbcApi>();
    errorHandler = std::make_shared<MockOdbcErrorHandler>();
    statementHandle = std::make_shared<MockOdbcStatementHandle>();
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

  std::shared_ptr<MockOdbcApi> odbcApi;
  std::shared_ptr<MockOdbcErrorHandler> errorHandler;
  std::shared_ptr<MockOdbcStatementHandle> statementHandle;
};

// Test that demonstrates how to use the MockIOdbcStatement
TEST_F(MockOdbcStatementTest, MockIOdbcStatementUsage)
{
  // Create a mock statement
  auto mockStatement = std::make_shared<MockIOdbcStatement>();

  // Create test columns
  std::vector<ColumnDefinition> columns;
  columns.push_back(CreateTestColumn("id", SQL_INTEGER));
  columns.push_back(CreateTestColumn("name", SQL_VARCHAR));
  columns.push_back(CreateTestColumn("age", SQL_INTEGER));

  // Configure the mock for a successful query
  mockStatement->ConfigureForSuccessfulQuery(columns, 5);

  // Set up explicit expectations for the sequence we want to test
  EXPECT_CALL(*mockStatement, Execute(_, _))
      .WillOnce(testing::Invoke([columns](auto &, std::shared_ptr<QueryResult> &result)
                                {
            for (const auto& col : columns) {
                result->addColumn(col);
            }
            result->set_row_count(5);
            result->set_end_of_rows(false);
            return true; }));

  EXPECT_CALL(*mockStatement, EndOfRows())
      .WillOnce(Return(false))
      .WillRepeatedly(Return(true));

  EXPECT_CALL(*mockStatement, TryReadRows(_, _))
      .WillOnce(testing::Invoke([](std::shared_ptr<QueryResult> result, size_t)
                                {
            result->set_end_of_rows(true);
            return true; }));

  EXPECT_CALL(*mockStatement, HasMoreResults())
      .WillRepeatedly(Return(false));

  // Create a result object to receive the query results
  auto result = std::make_shared<QueryResult>();

  // Execute the query (this should use our configured mock behavior)
  bool success = mockStatement->Execute({}, result);

  // Verify the results
  ASSERT_TRUE(success);
  ASSERT_EQ(3, result->get_column_count());
  ASSERT_FALSE(mockStatement->EndOfRows()); // Initially not at end

  // Try reading rows (should mark end of rows)
  ASSERT_TRUE(mockStatement->TryReadRows(result, 10));
  ASSERT_TRUE(mockStatement->EndOfRows()); // Now at end

  // Verify the column definitions
  std::string expected = "id";
  ASSERT_EQ(expected.length(), result->get(0).colNameLen);
  for (int i = 0; i < result->get(0).colNameLen; i++)
  {
    ASSERT_EQ(expected[i], static_cast<char>(result->get(0).colName[i]));
  }
  ASSERT_EQ(SQL_INTEGER, result->get(0).dataType);

  // Verify HasMoreResults returns false as configured
  ASSERT_FALSE(mockStatement->HasMoreResults());
}

// Test that demonstrates using MockIOdbcStatement with custom behavior
TEST_F(MockOdbcStatementTest, CustomMockBehavior)
{
  // Create a mock statement
  auto mockStatement = std::make_shared<MockIOdbcStatement>();

  // Set up custom behavior for specific methods
  EXPECT_CALL(*mockStatement, GetType())
      .WillRepeatedly(Return(StatementType::Prepared));

  EXPECT_CALL(*mockStatement, GetState())
      .WillOnce(Return(StatementState::STMT_INITIAL))
      .WillOnce(Return(StatementState::STMT_PREPARED))
      .WillOnce(Return(StatementState::STMT_EXECUTING))
      .WillRepeatedly(Return(StatementState::STMT_READING));

  // Check the behavior we set up
  ASSERT_EQ(StatementType::Prepared, mockStatement->GetType());

  // Verify state transitions
  ASSERT_EQ(StatementState::STMT_INITIAL, mockStatement->GetState());
  ASSERT_EQ(StatementState::STMT_PREPARED, mockStatement->GetState());
  ASSERT_EQ(StatementState::STMT_EXECUTING, mockStatement->GetState());
  ASSERT_EQ(StatementState::STMT_READING, mockStatement->GetState());
  ASSERT_EQ(StatementState::STMT_READING, mockStatement->GetState()); // Still reading
}

// Test that demonstrates how to use MockIOdbcStatement with error conditions
TEST_F(MockOdbcStatementTest, ErrorHandling)
{
  // Create a mock statement
  auto mockStatement = std::make_shared<MockIOdbcStatement>();

  // Set up error behavior
  EXPECT_CALL(*mockStatement, Execute(_, _))
      .WillOnce(Return(false));

  EXPECT_CALL(*mockStatement, GetState())
      .WillRepeatedly(Return(StatementState::STMT_ERROR));

  // Create a result to pass to Execute
  auto result = std::make_shared<QueryResult>();

  // Execute should fail
  bool success = mockStatement->Execute({}, result);
  ASSERT_FALSE(success);

  // State should be error
  ASSERT_EQ(StatementState::STMT_ERROR, mockStatement->GetState());
}