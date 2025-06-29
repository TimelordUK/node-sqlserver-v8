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

TEST_F(OdbcConnectionTest, OpenConnectionFails)
{
  // Arrange
  OdbcConnection connection(nullptr, mockOdbcApi);

  // Set up mock diagnostic info to return
  std::vector<DiagnosticInfo> diagnostics = {
      {"08001", -1, "Connection failed (mocked)"}};

  // Set up expectations for a failing connection
  EXPECT_CALL(*mockOdbcApi, SQLSetConnectAttr(_, SQL_ATTR_CONNECTION_TIMEOUT, _, _))
      .WillOnce(Return(SQL_SUCCESS));
  EXPECT_CALL(*mockOdbcApi, SQLSetConnectAttr(_, SQL_ATTR_LOGIN_TIMEOUT, _, _))
      .WillOnce(Return(SQL_SUCCESS));
  EXPECT_CALL(*mockOdbcApi, SQLSetConnectAttr(_, SQL_COPT_SS_BCP, _, _))
      .WillOnce(Return(SQL_SUCCESS));
  EXPECT_CALL(*mockOdbcApi, SQLDriverConnect(_, nullptr, _, _, nullptr, 0, nullptr, SQL_DRIVER_NOPROMPT))
      .WillOnce(Return(SQL_ERROR));

  // Expect ClearDiagnostics to be called
  EXPECT_CALL(*mockOdbcApi, ClearDiagnostics())
      .Times(1);

  // Expect GetDiagnostics to be called and return our mock errors
  EXPECT_CALL(*mockOdbcApi, GetDiagnostics())
      .Times(1)
      .WillOnce(Return(diagnostics));

  // Act
  bool openResult = connection.Open(u"connection_string", 30);

  // Assert
  EXPECT_FALSE(openResult);
  EXPECT_FALSE(connection.IsConnected());

  // Check that errors were captured correctly
  const auto &errors = connection.GetErrors();
  EXPECT_FALSE(errors.empty());
  EXPECT_EQ("08001", errors[0]->sqlstate);
  EXPECT_EQ("Connection failed (mocked)", errors[0]->message);
}