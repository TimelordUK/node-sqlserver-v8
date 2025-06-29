// test/helpers/src/test_utils.cpp
#include "platform.h"
#include "odbc_common.h"
#include "test_utils.h"
#include "string_utils.h"
#include <gmock/gmock.h>

using ::testing::_;
using ::testing::AtLeast;
using ::testing::DoAll;
using ::testing::InSequence;
using ::testing::Invoke;
using ::testing::Return;
using ::testing::SetArgPointee;

namespace mssql
{
  namespace test
  {

    void setupOdbcMockExpectations(
        std::shared_ptr<::testing::NiceMock<MockOdbcStatementHandle>> &mockStmtHandle,
        std::shared_ptr<::testing::NiceMock<MockOdbcErrorHandler>> &mockErrorHandler,
        std::shared_ptr<::testing::StrictMock<MockOdbcApi>> &mockOdbcApi,
        SQLHANDLE fakeHandle,
        const std::vector<TestDataBuilder::ColumnDefinition> &columnDefs,
        const std::vector<std::vector<std::string>> &rows)
    {
      // Set up basic mocks
      EXPECT_CALL(*mockStmtHandle, get_handle())
          .Times(AtLeast(1))
          .WillRepeatedly(Return(fakeHandle));

      // Calculate how many error checks we'll need
      int totalCalls = 3 + columnDefs.size() + rows.size() * (1 + columnDefs.size());

      EXPECT_CALL(*mockErrorHandler, CheckOdbcError(_))
          .Times(AtLeast(totalCalls))
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
              SetArgPointee<1>(static_cast<SQLSMALLINT>(columnDefs.size())),
              Return(SQL_SUCCESS)));

      // Column description expectations
      for (size_t i = 0; i < columnDefs.size(); i++)
      {
        EXPECT_CALL(*mockOdbcApi, SQLDescribeColW(fakeHandle, i + 1, _, _, _, _, _, _, _))
            .Times(1)
            .WillOnce(DoAll(
                Invoke([&columnDefs, i](
                           SQLHSTMT hstmt,
                           SQLUSMALLINT colNum,
                           SQLWCHAR *colName,
                           SQLSMALLINT bufLen,
                           SQLSMALLINT *nameLen,
                           SQLSMALLINT *dataType,
                           SQLULEN *colSize,
                           SQLSMALLINT *decDigits,
                           SQLSMALLINT *nullable)
                       {

                                // Convert column name to wide string
                                auto wideName = StringUtils::Utf8ToUtf16(columnDefs[i].name);

                                // Copy the column name (safely)
                                if (colName && bufLen > 0) {
                                    size_t copyLen = std::min(static_cast<size_t>(bufLen - 1), wideName->size());
                                    memcpy(colName, wideName->data(), copyLen * sizeof(SQLWCHAR));
                                    colName[copyLen] = 0;  // Null terminate
                                }

                                // Set output parameters
                                if (nameLen) *nameLen = static_cast<SQLSMALLINT>(columnDefs[i].name.length());
                                if (dataType) *dataType = columnDefs[i].type;
                                if (colSize) *colSize = columnDefs[i].size;
                                if (decDigits) *decDigits = columnDefs[i].decimalDigits;
                                if (nullable) *nullable = columnDefs[i].nullable; }),
                Return(SQL_SUCCESS)));
      }

      // Row fetching expectations (with InSequence to ensure proper order)
      {
        InSequence seq;

        // Each row fetch
        for (size_t rowIdx = 0; rowIdx < rows.size(); rowIdx++)
        {
          EXPECT_CALL(*mockOdbcApi, SQLFetch(fakeHandle))
              .WillOnce(Return(SQL_SUCCESS));

          // Each column in the row
          for (size_t colIdx = 0; colIdx < columnDefs.size(); colIdx++)
          {
            EXPECT_CALL(*mockOdbcApi, SQLGetData(fakeHandle, colIdx + 1, SQL_C_WCHAR, _, _, _))
                .WillOnce(DoAll(
                    Invoke([&rows, rowIdx, colIdx](
                               SQLHSTMT hstmt,
                               SQLUSMALLINT colNum,
                               SQLSMALLINT targetType,
                               SQLPOINTER buffer,
                               SQLLEN bufLen,
                               SQLLEN *strLen_or_Ind)
                           {

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
                                        } }),
                    Return(SQL_SUCCESS)));
          }
        }

        // End of data
        EXPECT_CALL(*mockOdbcApi, SQLFetch(fakeHandle))
            .WillOnce(Return(SQL_NO_DATA));
      }
    }

  } // namespace test
} // namespace mssql