#include "platform.h"
#include "odbc_common.h"
#include <gtest/gtest.h>
#include <gmock/gmock.h>
#include "mock_odbc_api.h"
#include "odbc_handles.h"
#include "odbc_error_handler.h"
#include "odbc_environment.h"
#include "query_parameter.h"
#include "string_utils.h"
#include "query_result.h"
#include "odbc_statement.h"
#include "test_utils.h"
#include "odbc_statement_fixture.h"


using ::testing::_;
using ::testing::AtLeast;
using ::testing::DoAll;
using ::testing::NiceMock;
using ::testing::Return;
using ::testing::SetArgReferee;

namespace mssql {
    namespace test {

        TEST_F(OdbcStatementFixture, DISABLED_PreparedStatementWithEmployeeData) {
            // Arrange
            const std::string query = "SELECT * FROM Employees WHERE id = ?";

            // Create the statement with our mock API
            PreparedStatement stmt(mockStmtHandle, mockErrorHandler, query, mockOdbcApi, StatementHandle());

            auto params = std::vector<std::shared_ptr<QueryParameter>>();
            auto result = std::make_shared<QueryResult>();

            // Use the employee test data helper
            auto testData = createEmployeeTestData();
            auto [columnDefs, rows] = testData.build();

            // Set up mock expectations using the helper
            setupOdbcMockExpectations(mockStmtHandle, mockErrorHandler,
                mockOdbcApi, fakeHandle, columnDefs, rows);

            // Act
            bool prepareSuccess = stmt.Prepare();
            bool executeSuccess = stmt.Execute(params, result);

            // Assert
            EXPECT_TRUE(prepareSuccess);
            EXPECT_TRUE(executeSuccess);

            // Add more specific assertions about the result structure if needed
        }

        TEST_F(OdbcStatementFixture, DISABLED_PreparedStatementWithProductData) {
            // Similar structure but using createProductTestData()
            const std::string query = "SELECT * FROM Products WHERE product_id = ?";

            PreparedStatement stmt(mockStmtHandle, mockErrorHandler, query, mockOdbcApi, StatementHandle());

            auto params = std::vector<std::shared_ptr<QueryParameter>>();
            auto result = std::make_shared<QueryResult>();

            auto testData = createProductTestData();
            auto [columnDefs, rows] = testData.build();

            setupOdbcMockExpectations(mockStmtHandle, mockErrorHandler,
                mockOdbcApi, fakeHandle, columnDefs, rows);

            bool prepareSuccess = stmt.Prepare();
            bool executeSuccess = stmt.Execute(params, result);

            EXPECT_TRUE(prepareSuccess);
            EXPECT_TRUE(executeSuccess);

            // Add more specific assertions
        }



        //TEST_F(OdbcStatementFixture, PreparedStatementPrepareAndExecute)
        //{
        //    // Arrange
        //    const std::string query = "SELECT * FROM TestTable WHERE id = ?";

        //    // Create a strict mock to ensure all calls are expected
        //    auto mockOdbcApi = std::make_shared<testing::StrictMock<MockOdbcApi>>();

        //    // Create the statement with our mock API
        //    PreparedStatement stmt(mockStmtHandle, mockErrorHandler, query, mockOdbcApi);

        //    auto params = std::vector<std::shared_ptr<QueryParameter>>();
        //    auto result = std::make_shared<QueryResult>();

        //    // The actual handle value doesn't matter since we're mocking the API
        //    // that would use it - we just need a consistent value
        //    SQLHANDLE fakeHandle = reinterpret_cast<SQLHANDLE>(0x12345678);

        //    // Set up basic mocks
        //    EXPECT_CALL(*mockStmtHandle, get_handle())
        //        .Times(AtLeast(1))
        //        .WillRepeatedly(Return(fakeHandle));

        //    EXPECT_CALL(*mockErrorHandler, CheckOdbcError(_))
        //        .Times(AtLeast(2))
        //        .WillRepeatedly(Return(true));

        //    // Prepare expectations
        //    EXPECT_CALL(*mockOdbcApi, SQLPrepareW(fakeHandle, _, _))
        //        .Times(1)
        //        .WillOnce(Return(SQL_SUCCESS));

        //    // Execute expectations
        //    EXPECT_CALL(*mockOdbcApi, SQLExecute(fakeHandle))
        //        .Times(1)
        //        .WillOnce(Return(SQL_SUCCESS));

        //    // Result processing expectations
        //    EXPECT_CALL(*mockOdbcApi, SQLNumResultCols(fakeHandle, _))
        //        .Times(1)
        //        .WillOnce(DoAll(
        //            testing::SetArgPointee<1>(0),  // No result columns
        //            Return(SQL_SUCCESS)
        //        ));

        //    // No need for fetch expectations if there are no columns

        //    // Act - now this should call our mock API, not the real ODBC
        //    bool prepareSuccess = stmt.Prepare();
        //    bool executeSuccess = stmt.Execute(params, result);

        //    // Assert
        //    EXPECT_TRUE(prepareSuccess);
        //    EXPECT_TRUE(executeSuccess);
        //}





        //// Test TransientStatement execution

        //TEST_F(OdbcStatementFixture, PreparedStatementWithRealResults)
        //{
        //    // Arrange
        //    const std::string query = "SELECT * FROM TestTable WHERE id = ?";

        //    // Create a strict mock for predictable behavior
        //    auto mockOdbcApi = std::make_shared<testing::StrictMock<MockOdbcApi>>();

        //    // Create the statement with our mock API
        //    PreparedStatement stmt(mockStmtHandle, mockErrorHandler, query, mockOdbcApi);

        //    auto params = std::vector<std::shared_ptr<QueryParameter>>();
        //    auto result = std::make_shared<QueryResult>();

        //    // Define our sample data
        //    std::vector<std::string> columnNames = { "id", "name", "value" };
        //    std::vector<SQLSMALLINT> columnTypes = { SQL_INTEGER, SQL_VARCHAR, SQL_DECIMAL };
        //    std::vector<std::vector<std::string>> rows = {
        //      {"1", "John", "100.50"},
        //      {"2", "Jane", "200.75"},
        //      {"3", "NULL", "300.00"}
        //    };

        //    // Use a consistent fake handle
        //    SQLHANDLE fakeHandle = reinterpret_cast<SQLHANDLE>(0x12345678);

        //    // Set up basic mocks
        //    EXPECT_CALL(*mockStmtHandle, get_handle())
        //        .Times(AtLeast(1))
        //        .WillRepeatedly(Return(fakeHandle));

        //    EXPECT_CALL(*mockErrorHandler, CheckOdbcError(_))
        //        .Times(AtLeast(3 + columnNames.size() + rows.size() * (1 + columnNames.size())))
        //        .WillRepeatedly(Return(true));

        //    // Prepare expectations
        //    EXPECT_CALL(*mockOdbcApi, SQLPrepareW(fakeHandle, _, _))
        //        .Times(1)
        //        .WillOnce(Return(SQL_SUCCESS));

        //    // Execute expectations
        //    EXPECT_CALL(*mockOdbcApi, SQLExecute(fakeHandle))
        //        .Times(1)
        //        .WillOnce(Return(SQL_SUCCESS));

        //    // Result column count expectations
        //    EXPECT_CALL(*mockOdbcApi, SQLNumResultCols(fakeHandle, _))
        //        .Times(1)
        //        .WillOnce(DoAll(
        //            testing::SetArgPointee<1>(static_cast<SQLSMALLINT>(columnNames.size())),
        //            Return(SQL_SUCCESS)
        //        ));

        //    // Column description expectations
        //    for (size_t i = 0; i < columnNames.size(); i++) {
        //        EXPECT_CALL(*mockOdbcApi, SQLDescribeColW(fakeHandle, i + 1, _, _, _, _, _, _, _))
        //            .Times(1)
        //            .WillOnce(DoAll(
        //                testing::Invoke([&columnNames, &columnTypes, i](
        //                    SQLHSTMT hstmt,
        //                    SQLUSMALLINT colNum,
        //                    SQLWCHAR* colName,
        //                    SQLSMALLINT bufLen,
        //                    SQLSMALLINT* nameLen,
        //                    SQLSMALLINT* dataType,
        //                    SQLULEN* colSize,
        //                    SQLSMALLINT* decDigits,
        //                    SQLSMALLINT* nullable) {

        //                        // Convert column name to wide string
        //                        auto wideName = StringUtils::Utf8ToUtf16(columnNames[i]);

        //                        // Copy the column name (safely)
        //                        if (colName && bufLen > 0) {
        //                            size_t copyLen = std::min(static_cast<size_t>(bufLen - 1), wideName->size());
        //                            memcpy(colName, wideName->data(), copyLen * sizeof(SQLWCHAR));
        //                            colName[copyLen] = 0;  // Null terminate
        //                        }

        //                        // Set output parameters
        //                        if (nameLen) *nameLen = static_cast<SQLSMALLINT>(columnNames[i].length());
        //                        if (dataType) *dataType = columnTypes[i];
        //                        if (colSize) *colSize = 255;
        //                        if (decDigits) *decDigits = 0;
        //                        if (nullable) *nullable = SQL_NULLABLE;
        //                    }),
        //                Return(SQL_SUCCESS)
        //            ));
        //    }

        //    // Row fetching expectations (with InSequence to ensure proper order)
        //    {
        //        testing::InSequence seq;

        //        // Each row fetch
        //        for (size_t rowIdx = 0; rowIdx < rows.size(); rowIdx++) {
        //            EXPECT_CALL(*mockOdbcApi, SQLFetch(fakeHandle))
        //                .WillOnce(Return(SQL_SUCCESS));

        //            // Each column in the row
        //            for (size_t colIdx = 0; colIdx < columnNames.size(); colIdx++) {
        //                EXPECT_CALL(*mockOdbcApi, SQLGetData(fakeHandle, colIdx + 1, SQL_C_WCHAR, _, _, _))
        //                    .WillOnce(DoAll(
        //                        testing::Invoke([&rows, rowIdx, colIdx](
        //                            SQLHSTMT hstmt,
        //                            SQLUSMALLINT colNum,
        //                            SQLSMALLINT targetType,
        //                            SQLPOINTER buffer,
        //                            SQLLEN bufLen,
        //                            SQLLEN* strLen_or_Ind) {

        //                                // Get the cell value
        //                                std::string value = rows[rowIdx][colIdx];

        //                                // Handle NULL values
        //                                if (value == "NULL") {
        //                                    if (strLen_or_Ind) *strLen_or_Ind = SQL_NULL_DATA;
        //                                    return;
        //                                }

        //                                // Convert to wide string
        //                                auto wideValue = StringUtils::Utf8ToUtf16(value);

        //                                // Copy safely if buffer provided
        //                                if (buffer && bufLen > 0) {
        //                                    size_t copyLen = std::min(static_cast<size_t>((bufLen / sizeof(SQLWCHAR)) - 1), wideValue->size());
        //                                    memcpy(buffer, wideValue->data(), copyLen * sizeof(SQLWCHAR));
        //                                    static_cast<SQLWCHAR*>(buffer)[copyLen] = 0;  // Null terminate

        //                                    if (strLen_or_Ind) *strLen_or_Ind = static_cast<SQLLEN>(copyLen * sizeof(SQLWCHAR));
        //                                }
        //                            }),
        //                        Return(SQL_SUCCESS)
        //                    ));
        //            }
        //        }

        //        // End of data
        //        EXPECT_CALL(*mockOdbcApi, SQLFetch(fakeHandle))
        //            .WillOnce(Return(SQL_NO_DATA));
        //    }

        //    // Act
        //    bool prepareSuccess = stmt.Prepare();
        //    bool executeSuccess = stmt.Execute(params, result);

        //    // Assert
        //    EXPECT_TRUE(prepareSuccess);
        //    EXPECT_TRUE(executeSuccess);

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