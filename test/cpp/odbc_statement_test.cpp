#include <gtest/gtest.h>
#include <gmock/gmock.h>
#include "odbc_statement.h"
#include "odbc_handles.h"
#include "odbc_error_handler.h"
#include "odbc_environment.h"
#include "query_parameter.h"
#include "string_utils.h"
#include "query_result.h"
#include "mock_odbc_api.h"
#include "odbc_handles.h"
#include "query_result.h"

using ::testing::_;
using ::testing::AtLeast;
using ::testing::DoAll;
using ::testing::NiceMock;
using ::testing::Return;
using ::testing::SetArgReferee;

namespace mssql
{
	class MockOdbcApi;

	// Mock error handler for testing
    class MockOdbcErrorHandler : public OdbcErrorHandler
    {
    public:
        explicit MockOdbcErrorHandler() : OdbcErrorHandler(nullptr) {}
        MOCK_METHOD(bool, CheckOdbcError, (SQLRETURN ret), (override));
        MOCK_METHOD(bool, ReturnOdbcError, (), (override));
        MOCK_METHOD(void, ClearErrors, (), (override));
        MOCK_METHOD(const std::vector<std::shared_ptr<OdbcError>>&, GetErrors, (), (const, override));
    };

	// Add this to your test file or a test utilities header
    namespace odbctest {
        // Wrappers for ODBC functions that we can mock
        SQLRETURN SQLNumResultCols_Wrapper(SQLHSTMT statement, SQLSMALLINT* columnCount) {
            return SQLNumResultCols(statement, columnCount);
        }

        SQLRETURN SQLDescribeCol_Wrapper(
            SQLHSTMT statement,
            SQLUSMALLINT columnNumber,
            SQLWCHAR* columnName,
            SQLSMALLINT bufferLength,
            SQLSMALLINT* nameLength,
            SQLSMALLINT* dataType,
            SQLULEN* columnSize,
            SQLSMALLINT* decimalDigits,
            SQLSMALLINT* nullable) {
            return SQLDescribeCol(
                statement, columnNumber, columnName, bufferLength,
                nameLength, dataType, columnSize, decimalDigits, nullable);
        }

        SQLRETURN SQLFetch_Wrapper(SQLHSTMT statement) {
            return SQLFetch(statement);
        }

        SQLRETURN SQLGetData_Wrapper(
            SQLHSTMT statement,
            SQLUSMALLINT columnNumber,
            SQLSMALLINT targetType,
            SQLPOINTER targetValue,
            SQLLEN bufferLength,
            SQLLEN* strLen_or_Ind) {
            return SQLGetData(
                statement, columnNumber, targetType,
                targetValue, bufferLength, strLen_or_Ind);
        }
    }



    class MockOdbcEnvironmentHandle final : public IOdbcEnvironmentHandle
    {
    public:
        MOCK_METHOD(bool, alloc, (SQLHANDLE parent), (override));
        MOCK_METHOD(void, free, (), (override));
        MOCK_METHOD(void, read_errors, (std::shared_ptr<std::vector<std::shared_ptr<OdbcError>>>& errors), (const, override));
        MOCK_METHOD(SQLHANDLE, get_handle, (), (const, override));
    };

    class MockOdbcEnvironment final : public IOdbcEnvironment
    {
    public:
        MOCK_METHOD(bool, Initialize, (), (override));
        MOCK_METHOD(std::shared_ptr<IOdbcEnvironmentHandle>, GetEnvironmentHandle, (), (override));
        MOCK_METHOD(void, ReadErrors, (std::shared_ptr<std::vector<std::shared_ptr<OdbcError>>> errors), (override));
    };


    class MockOdbcStatementHandle : public IOdbcStatementHandle {
    public:
        MOCK_METHOD(bool, alloc, (SQLHANDLE parent), (override));
        MOCK_METHOD(void, free, (), (override));
        MOCK_METHOD(void, read_errors, (std::shared_ptr<std::vector<std::shared_ptr<OdbcError>>>& errors), (const, override));
        MOCK_METHOD(SQLHANDLE, get_handle, (), (const, override));

        // Add helper methods to set up test data
        void SetupResultColumns(int numColumns, const std::vector<std::string>& columnNames) {
            numResultColumns = numColumns;
            this->columnNames = columnNames;
        }

        void SetupResultRows(const std::vector<std::vector<std::string>>& rows) {
            resultRows = rows;
            currentRowIndex = -1; // Start before first row
        }

        // Mock functions that will be used by our patched ODBC functions
        SQLRETURN MockSQLNumResultCols(SQLSMALLINT* numCols) {
            *numCols = static_cast<SQLSMALLINT>(numResultColumns);
            return SQL_SUCCESS;
        }

        SQLRETURN MockSQLDescribeCol(
            SQLUSMALLINT colIndex,
            SQLWCHAR* colName,
            SQLSMALLINT bufferLen,
            SQLSMALLINT* nameLen,
            SQLSMALLINT* dataType,
            SQLULEN* columnSize,
            SQLSMALLINT* decimalDigits,
            SQLSMALLINT* nullable) {

            if (colIndex > numResultColumns || colIndex <= 0) {
                return SQL_ERROR;
            }

            std::string colNameStr = columnNames[colIndex - 1];
            auto wideColName = StringUtils::Utf8ToUtf16(colNameStr);
            size_t copyLen = std::min(static_cast<size_t>(bufferLen - 1), wideColName->size());
            memcpy(colName, wideColName->data(), copyLen * sizeof(SQLWCHAR));
            colName[copyLen] = 0; // Null terminate

            if (nameLen) *nameLen = static_cast<SQLSMALLINT>(colNameStr.length());
            if (dataType) *dataType = SQL_VARCHAR; // Default to VARCHAR
            if (columnSize) *columnSize = 255;
            if (decimalDigits) *decimalDigits = 0;
            if (nullable) *nullable = SQL_NULLABLE;

            return SQL_SUCCESS;
        }

        SQLRETURN MockSQLFetch() {
            currentRowIndex++;
            if (currentRowIndex >= static_cast<int>(resultRows.size())) {
                return SQL_NO_DATA;
            }
            return SQL_SUCCESS;
        }

        SQLRETURN MockSQLGetData(
            SQLUSMALLINT colIndex,
            SQLSMALLINT targetType,
            SQLPOINTER buffer,
            SQLLEN bufferLen,
            SQLLEN* indicator) {

            if (colIndex > numResultColumns || colIndex <= 0 ||
                currentRowIndex < 0 || currentRowIndex >= static_cast<int>(resultRows.size())) {
                return SQL_ERROR;
            }

            std::string value = resultRows[currentRowIndex][colIndex - 1];

            if (value == "NULL") {
                *indicator = SQL_NULL_DATA;
                return SQL_SUCCESS;
            }

            if (targetType == SQL_C_WCHAR) {
                auto wideValue = StringUtils::Utf8ToUtf16(value);
                size_t copyLen = std::min(static_cast<size_t>((bufferLen / sizeof(SQLWCHAR)) - 1), wideValue->size());
                memcpy(buffer, wideValue->data(), copyLen * sizeof(SQLWCHAR));
                static_cast<SQLWCHAR*>(buffer)[copyLen] = 0; // Null terminate
                *indicator = static_cast<SQLLEN>(copyLen * sizeof(SQLWCHAR));
            }

            return SQL_SUCCESS;
        }

    private:
        int numResultColumns = 0;
        std::vector<std::string> columnNames;
        std::vector<std::vector<std::string>> resultRows;
        int currentRowIndex = -1;
    };





  class OdbcStatementTest : public ::testing::Test
  {
  protected:
    void SetUp() override
    {
      mockStmtHandle = std::make_shared<NiceMock<MockOdbcStatementHandle>>();
      mockErrorHandler = std::make_shared<NiceMock<MockOdbcErrorHandler>>();

      // Set up default behavior with a more realistic handle value
      ON_CALL(*mockStmtHandle, get_handle())
          .WillByDefault(Return(reinterpret_cast<SQLHANDLE>(mockStmtHandle.get())));
      ON_CALL(*mockStmtHandle, alloc(_))
          .WillByDefault(Return(true));
      ON_CALL(*mockErrorHandler, CheckOdbcError(_))
          .WillByDefault(Return(true));
      ON_CALL(*mockErrorHandler, ReturnOdbcError())
          .WillByDefault(Return(false));
    }

    std::shared_ptr<MockOdbcStatementHandle> mockStmtHandle;
    std::shared_ptr<MockOdbcErrorHandler> mockErrorHandler;
  };


  TEST_F(OdbcStatementTest, PreparedStatementPrepareAndExecute)
  {
      // Arrange
      const std::string query = "SELECT * FROM TestTable WHERE id = ?";

      // Create a strict mock to ensure all calls are expected
      auto mockOdbcApi = std::make_shared<testing::StrictMock<MockOdbcApi>>();

      // Create the statement with our mock API
      PreparedStatement stmt(mockStmtHandle, mockErrorHandler, query, mockOdbcApi);

      auto params = std::vector<std::shared_ptr<QueryParameter>>();
      auto result = std::make_shared<QueryResult>();

      // The actual handle value doesn't matter since we're mocking the API
      // that would use it - we just need a consistent value
      SQLHANDLE fakeHandle = reinterpret_cast<SQLHANDLE>(0x12345678);

      // Set up basic mocks
      EXPECT_CALL(*mockStmtHandle, get_handle())
          .Times(AtLeast(1))
          .WillRepeatedly(Return(fakeHandle));

      EXPECT_CALL(*mockErrorHandler, CheckOdbcError(_))
          .Times(AtLeast(2))
          .WillRepeatedly(Return(true));

      // Prepare expectations
      EXPECT_CALL(*mockOdbcApi, SQLPrepareW(fakeHandle, _, _))
          .Times(1)
          .WillOnce(Return(SQL_SUCCESS));

      // Execute expectations
      EXPECT_CALL(*mockOdbcApi, SQLExecute(fakeHandle))
          .Times(1)
          .WillOnce(Return(SQL_SUCCESS));

      // Result processing expectations
      EXPECT_CALL(*mockOdbcApi, SQLNumResultCols(fakeHandle, _))
          .Times(1)
          .WillOnce(DoAll(
	      testing::SetArgPointee<1>(0),  // No result columns
              Return(SQL_SUCCESS)
          ));

      // No need for fetch expectations if there are no columns

      // Act - now this should call our mock API, not the real ODBC
      bool prepareSuccess = stmt.Prepare();
      bool executeSuccess = stmt.Execute(params, result);

      // Assert
      EXPECT_TRUE(prepareSuccess);
      EXPECT_TRUE(executeSuccess);
  }





  // Test TransientStatement execution

  TEST_F(OdbcStatementTest, PreparedStatementWithRealResults)
  {
      // Arrange
      const std::string query = "SELECT * FROM TestTable WHERE id = ?";

      // Create a strict mock for predictable behavior
      auto mockOdbcApi = std::make_shared<testing::StrictMock<MockOdbcApi>>();

      // Create the statement with our mock API
      PreparedStatement stmt(mockStmtHandle, mockErrorHandler, query, mockOdbcApi);

      auto params = std::vector<std::shared_ptr<QueryParameter>>();
      auto result = std::make_shared<QueryResult>();

      // Define our sample data
      std::vector<std::string> columnNames = { "id", "name", "value" };
      std::vector<SQLSMALLINT> columnTypes = { SQL_INTEGER, SQL_VARCHAR, SQL_DECIMAL };
      std::vector<std::vector<std::string>> rows = {
        {"1", "John", "100.50"},
        {"2", "Jane", "200.75"},
        {"3", "NULL", "300.00"}
      };

      // Use a consistent fake handle
      SQLHANDLE fakeHandle = reinterpret_cast<SQLHANDLE>(0x12345678);

      // Set up basic mocks
      EXPECT_CALL(*mockStmtHandle, get_handle())
          .Times(AtLeast(1))
          .WillRepeatedly(Return(fakeHandle));

      EXPECT_CALL(*mockErrorHandler, CheckOdbcError(_))
          .Times(AtLeast(3 + columnNames.size() + rows.size() * (1 + columnNames.size())))
          .WillRepeatedly(Return(true));

      // Prepare expectations
      EXPECT_CALL(*mockOdbcApi, SQLPrepareW(fakeHandle, _, _))
          .Times(1)
          .WillOnce(Return(SQL_SUCCESS));

      // Execute expectations
      EXPECT_CALL(*mockOdbcApi, SQLExecute(fakeHandle))
          .Times(1)
          .WillOnce(Return(SQL_SUCCESS));

      // Result column count expectations
      EXPECT_CALL(*mockOdbcApi, SQLNumResultCols(fakeHandle, _))
          .Times(1)
          .WillOnce(DoAll(
              testing::SetArgPointee<1>(static_cast<SQLSMALLINT>(columnNames.size())),
              Return(SQL_SUCCESS)
          ));

      // Column description expectations
      for (size_t i = 0; i < columnNames.size(); i++) {
          EXPECT_CALL(*mockOdbcApi, SQLDescribeColW(fakeHandle, i + 1, _, _, _, _, _, _, _))
              .Times(1)
              .WillOnce(DoAll(
	          testing::Invoke([&columnNames, &columnTypes, i](
                      SQLHSTMT hstmt,
                      SQLUSMALLINT colNum,
                      SQLWCHAR* colName,
                      SQLSMALLINT bufLen,
                      SQLSMALLINT* nameLen,
                      SQLSMALLINT* dataType,
                      SQLULEN* colSize,
                      SQLSMALLINT* decDigits,
                      SQLSMALLINT* nullable) {

                          // Convert column name to wide string
                          auto wideName = StringUtils::Utf8ToUtf16(columnNames[i]);

                          // Copy the column name (safely)
                          if (colName && bufLen > 0) {
                              size_t copyLen = std::min(static_cast<size_t>(bufLen - 1), wideName->size());
                              memcpy(colName, wideName->data(), copyLen * sizeof(SQLWCHAR));
                              colName[copyLen] = 0;  // Null terminate
                          }

                          // Set output parameters
                          if (nameLen) *nameLen = static_cast<SQLSMALLINT>(columnNames[i].length());
                          if (dataType) *dataType = columnTypes[i];
                          if (colSize) *colSize = 255;
                          if (decDigits) *decDigits = 0;
                          if (nullable) *nullable = SQL_NULLABLE;
                      }),
                  Return(SQL_SUCCESS)
              ));
      }

      // Row fetching expectations (with InSequence to ensure proper order)
      {
          testing::InSequence seq;

          // Each row fetch
          for (size_t rowIdx = 0; rowIdx < rows.size(); rowIdx++) {
              EXPECT_CALL(*mockOdbcApi, SQLFetch(fakeHandle))
                  .WillOnce(Return(SQL_SUCCESS));

              // Each column in the row
              for (size_t colIdx = 0; colIdx < columnNames.size(); colIdx++) {
                  EXPECT_CALL(*mockOdbcApi, SQLGetData(fakeHandle, colIdx + 1, SQL_C_WCHAR, _, _, _))
                      .WillOnce(DoAll(
	                  testing::Invoke([&rows, rowIdx, colIdx](
                              SQLHSTMT hstmt,
                              SQLUSMALLINT colNum,
                              SQLSMALLINT targetType,
                              SQLPOINTER buffer,
                              SQLLEN bufLen,
                              SQLLEN* strLen_or_Ind) {

                                  // Get the cell value
                                  std::string value = rows[rowIdx][colIdx];

                                  // Handle NULL values
                                  if (value == "NULL") {
                                      if (strLen_or_Ind) *strLen_or_Ind = SQL_NULL_DATA;
                                      return;
                                  }

                                  // Convert to wide string
                                  auto wideValue = StringUtils::Utf8ToUtf16(value);

                                  // Copy safely if buffer provided
                                  if (buffer && bufLen > 0) {
                                      size_t copyLen = std::min(static_cast<size_t>((bufLen / sizeof(SQLWCHAR)) - 1), wideValue->size());
                                      memcpy(buffer, wideValue->data(), copyLen * sizeof(SQLWCHAR));
                                      static_cast<SQLWCHAR*>(buffer)[copyLen] = 0;  // Null terminate

                                      if (strLen_or_Ind) *strLen_or_Ind = static_cast<SQLLEN>(copyLen * sizeof(SQLWCHAR));
                                  }
                              }),
                          Return(SQL_SUCCESS)
                      ));
              }
          }

          // End of data
          EXPECT_CALL(*mockOdbcApi, SQLFetch(fakeHandle))
              .WillOnce(Return(SQL_NO_DATA));
      }

      // Act
      bool prepareSuccess = stmt.Prepare();
      bool executeSuccess = stmt.Execute(params, result);

      // Assert
      EXPECT_TRUE(prepareSuccess);
      EXPECT_TRUE(executeSuccess);

      // Verify result structure
      //ASSERT_EQ(result->getColumnCount(), columnNames.size());
      //ASSERT_EQ(result->getRowCount(), rows.size());

      //// Verify column metadata
      //for (size_t i = 0; i < columnNames.size(); i++) {
      //    EXPECT_EQ(result->getColumnName(i), columnNames[i]);
      //    EXPECT_EQ(result->getColumnType(i), columnTypes[i]);
      //}

      //// Verify row data
      //for (size_t rowIdx = 0; rowIdx < rows.size(); rowIdx++) {
      //    for (size_t colIdx = 0; colIdx < columnNames.size(); colIdx++) {
      //        EXPECT_EQ(result->getValue(rowIdx, colIdx), rows[rowIdx][colIdx]);
      //    }
      //}
  }

}