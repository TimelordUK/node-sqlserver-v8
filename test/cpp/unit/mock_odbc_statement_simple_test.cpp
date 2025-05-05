#include "platform.h"
#include "odbc_common.h"
#include <gtest/gtest.h>
#include <gmock/gmock.h>
#include "mock_odbc_statement.h"
#include "odbc_driver_types.h"

using namespace mssql;
using namespace testing;
using ::testing::NiceMock;

// Separate test just to show a simple mock is working
TEST(MockOdbcStatementSimpleTest, SimpleMock)
{
  // Create a direct mock
  auto mockStatement = std::make_shared<MockIOdbcStatement>();

  // Test basic functionality
  EXPECT_CALL(*mockStatement, GetType())
      .WillOnce(Return(StatementType::Prepared));

  EXPECT_CALL(*mockStatement, GetState())
      .WillOnce(Return(StatementState::STMT_INITIAL));

  // Verify the result
  ASSERT_EQ(StatementType::Prepared, mockStatement->GetType());
  ASSERT_EQ(StatementState::STMT_INITIAL, mockStatement->GetState());
}