#include <gtest/gtest.h>
#include "mock_odbc_statement.h"
#include "query_parameter.h"
#include "query_result.h"

using ::testing::_;
using ::testing::AtLeast;
using ::testing::NiceMock;
using ::testing::Return;

namespace mssql
{
  class OdbcStatementTest : public ::testing::Test
  {
  protected:
    void SetUp() override
    {
      mockStmtHandle = std::make_shared<NiceMock<MockOdbcStatementHandle>>();
      mockErrorHandler = std::make_shared<NiceMock<MockOdbcErrorHandler>>();

      // Set up default behavior
      ON_CALL(*mockStmtHandle, get_handle())
          .WillByDefault(Return(reinterpret_cast<SQLHANDLE>(1)));
      ON_CALL(*mockStmtHandle, alloc(_))
          .WillByDefault(Return(true));
      ON_CALL(*mockErrorHandler, CheckOdbcError(_))
          .WillByDefault(Return(true));
    }

    std::shared_ptr<MockOdbcStatementHandle> mockStmtHandle;
    std::shared_ptr<MockOdbcErrorHandler> mockErrorHandler;
  };

  // Test TransientStatement execution
  TEST_F(OdbcStatementTest, TransientStatementExecute)
  {
    // Arrange
    const std::string query = "SELECT * FROM TestTable";
    TransientStatement stmt(mockStmtHandle, mockErrorHandler, query);
    auto params = std::vector<std::shared_ptr<QueryParameter>>();
    auto result = std::make_shared<QueryResult>();

    // Expect SQLPrepare and SQLExecute to be called
    EXPECT_CALL(*mockStmtHandle, get_handle())
        .Times(AtLeast(1));
    EXPECT_CALL(*mockErrorHandler, CheckOdbcError(_))
        .Times(AtLeast(2)) // Once for prepare, once for execute
        .WillRepeatedly(Return(true));

    // Act
    bool success = stmt.Execute(params, result);

    // Assert
    EXPECT_TRUE(success);
  }

  // Test PreparedStatement preparation and execution
  TEST_F(OdbcStatementTest, PreparedStatementPrepareAndExecute)
  {
    // Arrange
    const std::string query = "SELECT * FROM TestTable WHERE id = ?";
    PreparedStatement stmt(mockStmtHandle, mockErrorHandler, query);
    auto params = std::vector<std::shared_ptr<QueryParameter>>();
    auto result = std::make_shared<QueryResult>();

    // Expect SQLPrepare to be called during Prepare()
    EXPECT_CALL(*mockStmtHandle, get_handle())
        .Times(AtLeast(1));
    EXPECT_CALL(*mockErrorHandler, CheckOdbcError(_))
        .Times(AtLeast(2)) // Once for prepare, once for execute
        .WillRepeatedly(Return(true));

    // Act
    bool prepareSuccess = stmt.Prepare();
    bool executeSuccess = stmt.Execute(params, result);

    // Assert
    EXPECT_TRUE(prepareSuccess);
    EXPECT_TRUE(executeSuccess);
  }

  // Test PreparedStatement with parameter binding
  TEST_F(OdbcStatementTest, PreparedStatementWithParameters)
  {
    // Arrange
    const std::string query = "INSERT INTO TestTable (id, name) VALUES (?, ?)";
    PreparedStatement stmt(mockStmtHandle, mockErrorHandler, query);

    // Create parameters
    auto param1 = std::make_shared<QueryParameter>(1, std::make_shared<DatumStorage>());
    auto param2 = std::make_shared<QueryParameter>(2, std::make_shared<DatumStorage>());
    std::vector<std::shared_ptr<QueryParameter>> params = {param1, param2};
    auto result = std::make_shared<QueryResult>();

    // Expect multiple calls for prepare and parameter binding
    EXPECT_CALL(*mockStmtHandle, get_handle())
        .Times(AtLeast(3)); // Prepare + 2 parameter bindings
    EXPECT_CALL(*mockErrorHandler, CheckOdbcError(_))
        .Times(AtLeast(4)) // Prepare + 2 bindings + execute
        .WillRepeatedly(Return(true));

    // Act
    bool prepareSuccess = stmt.Prepare();
    bool executeSuccess = stmt.Execute(params, result);

    // Assert
    EXPECT_TRUE(prepareSuccess);
    EXPECT_TRUE(executeSuccess);
  }

  // Test error handling during preparation
  TEST_F(OdbcStatementTest, PrepareStatementError)
  {
    // Arrange
    const std::string query = "INVALID SQL QUERY";
    PreparedStatement stmt(mockStmtHandle, mockErrorHandler, query);

    // Expect SQLPrepare to fail
    EXPECT_CALL(*mockErrorHandler, CheckOdbcError(_))
        .WillOnce(Return(false));

    // Act
    bool success = stmt.Prepare();

    // Assert
    EXPECT_FALSE(success);
  }

  // Test error handling during execution
  TEST_F(OdbcStatementTest, ExecuteStatementError)
  {
    // Arrange
    const std::string query = "SELECT * FROM TestTable";
    TransientStatement stmt(mockStmtHandle, mockErrorHandler, query);
    auto params = std::vector<std::shared_ptr<QueryParameter>>();
    auto result = std::make_shared<QueryResult>();

    // Expect SQLExecute to fail
    EXPECT_CALL(*mockErrorHandler, CheckOdbcError(_))
        .WillOnce(Return(true))   // Prepare succeeds
        .WillOnce(Return(false)); // Execute fails

    // Act
    bool success = stmt.Execute(params, result);

    // Assert
    EXPECT_FALSE(success);
  }

  // Test TVP statement column binding
  TEST_F(OdbcStatementTest, TvpStatementColumnBinding)
  {
    // Arrange
    const std::string query = "INSERT INTO TestTable SELECT * FROM @tvp";
    const std::string tvpType = "dbo.TestTableType";
    TvpStatement stmt(mockStmtHandle, mockErrorHandler, query, tvpType);
    std::vector<std::string> columnNames = {"id", "name", "value"};

    // Act
    bool success = stmt.BindTvpColumns(columnNames);

    // Assert
    EXPECT_TRUE(success); // Currently always returns true as it's not implemented
  }

  // Test statement factory
  TEST_F(OdbcStatementTest, StatementFactoryCreation)
  {
    // Arrange
    const std::string query = "SELECT * FROM TestTable";

    // Act & Assert
    auto transient = StatementFactory::CreateStatement(
        OdbcStatement::Type::Transient, mockStmtHandle, mockErrorHandler, query);
    EXPECT_NE(transient, nullptr);
    EXPECT_EQ(transient->getType(), OdbcStatement::Type::Transient);

    auto prepared = StatementFactory::CreateStatement(
        OdbcStatement::Type::Prepared, mockStmtHandle, mockErrorHandler, query);
    EXPECT_NE(prepared, nullptr);
    EXPECT_EQ(prepared->getType(), OdbcStatement::Type::Prepared);

    auto tvp = StatementFactory::CreateStatement(
        OdbcStatement::Type::TVP, mockStmtHandle, mockErrorHandler, query, "dbo.TestType");
    EXPECT_NE(tvp, nullptr);
    EXPECT_EQ(tvp->getType(), OdbcStatement::Type::TVP);
  }
}