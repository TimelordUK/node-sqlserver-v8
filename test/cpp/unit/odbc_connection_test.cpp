#include <gtest/gtest.h>
#include <gmock/gmock.h>
#include "platform.h"
#include "odbc_common.h"
#include "odbc_connection.h"
#include "mock_odbc_api.h"

using namespace mssql;
using ::testing::_;
using ::testing::Return;

class OdbcConnectionTest : public ::testing::Test
{
protected:
  void SetUp() override
  {
    mockOdbcApi = std::make_shared<MockOdbcApi>();
  }

  std::shared_ptr<MockOdbcApi> mockOdbcApi;
};

TEST_F(OdbcConnectionTest, OpenAndCloseConnection)
{
  // Arrange
  OdbcConnection connection(nullptr, mockOdbcApi);

  // Set up expectations
  EXPECT_CALL(*mockOdbcApi, SQLSetConnectAttr(_, SQL_ATTR_CONNECTION_TIMEOUT, _, _))
      .WillOnce(Return(SQL_SUCCESS));
  EXPECT_CALL(*mockOdbcApi, SQLSetConnectAttr(_, SQL_ATTR_LOGIN_TIMEOUT, _, _))
      .WillOnce(Return(SQL_SUCCESS));
  EXPECT_CALL(*mockOdbcApi, SQLSetConnectAttr(_, SQL_COPT_SS_BCP, _, _))
      .WillOnce(Return(SQL_SUCCESS));
  EXPECT_CALL(*mockOdbcApi, SQLDriverConnect(_, nullptr, _, _, nullptr, 0, nullptr, SQL_DRIVER_NOPROMPT))
      .WillOnce(Return(SQL_SUCCESS));

  // Act
  bool openResult = connection.Open("connection_string", 30);

  // Assert
  EXPECT_TRUE(openResult);
  EXPECT_TRUE(connection.IsConnected());

  // Set up expectations for close
  EXPECT_CALL(*mockOdbcApi, SQLDisconnect(_))
      .WillOnce(Return(SQL_SUCCESS));

  // Act
  bool closeResult = connection.Close();

  // Assert
  EXPECT_TRUE(closeResult);
  EXPECT_FALSE(connection.IsConnected());
}