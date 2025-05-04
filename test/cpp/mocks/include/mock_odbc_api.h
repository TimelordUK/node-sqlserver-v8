#pragma once
#include "iodbc_api.h"
#include <gmock/gmock.h>

namespace mssql
{
  class MockOdbcApi : public IOdbcApi
  {
  public:
    // Connection methods
    MOCK_METHOD(SQLRETURN, SQLDisconnect, (SQLHDBC ConnectionHandle), (override));
    MOCK_METHOD(SQLRETURN, SQLSetConnectAttr,
                (SQLHDBC ConnectionHandle,
                 SQLINTEGER Attribute,
                 SQLPOINTER Value,
                 SQLINTEGER StringLength),
                (override));
    MOCK_METHOD(SQLRETURN, SQLDriverConnect,
                (SQLHDBC ConnectionHandle,
                 SQLHWND WindowHandle,
                 SQLWCHAR *InConnectionString,
                 SQLSMALLINT StringLength1,
                 SQLWCHAR *OutConnectionString,
                 SQLSMALLINT BufferLength,
                 SQLSMALLINT *StringLength2Ptr,
                 SQLUSMALLINT DriverCompletion),
                (override));
    // Statement methods - always using 'W' versions where applicable
    MOCK_METHOD(SQLRETURN, SQLExecute, (SQLHSTMT StatementHandle), (override));
    MOCK_METHOD(SQLRETURN, SQLNumResultCols, (SQLHSTMT StatementHandle, SQLSMALLINT *ColumnCount), (override));
    MOCK_METHOD(SQLRETURN, SQLPrepareW,
                (SQLHSTMT StatementHandle,
                 SQLWCHAR *StatementText,
                 SQLINTEGER TextLength),
                (override));
    MOCK_METHOD(SQLRETURN, SQLExecDirectW,
                (SQLHSTMT hstmt,
                 SQLWCHAR *szSqlStr,
                 SQLINTEGER TextLength),
                (override));
    MOCK_METHOD(SQLRETURN, SQLDescribeColW,
                (SQLHSTMT StatementHandle,
                 SQLUSMALLINT ColumnNumber,
                 SQLWCHAR *ColumnName,
                 SQLSMALLINT BufferLength,
                 SQLSMALLINT *NameLength,
                 SQLSMALLINT *DataType,
                 SQLULEN *ColumnSize,
                 SQLSMALLINT *DecimalDigits,
                 SQLSMALLINT *Nullable),
                (override));
    MOCK_METHOD(SQLRETURN, SQLFetch, (SQLHSTMT StatementHandle), (override));
    MOCK_METHOD(SQLRETURN, SQLGetData,
                (SQLHSTMT StatementHandle,
                 SQLUSMALLINT ColumnNumber,
                 SQLSMALLINT TargetType,
                 SQLPOINTER TargetValue,
                 SQLLEN BufferLength,
                 SQLLEN *StrLen_or_Ind),
                (override));
    MOCK_METHOD(SQLRETURN, SQLBindParameter,
                (SQLHSTMT hstmt,
                 SQLUSMALLINT ipar,
                 SQLSMALLINT fParamType,
                 SQLSMALLINT fCType,
                 SQLSMALLINT fSqlType,
                 SQLULEN cbColDef,
                 SQLSMALLINT ibScale,
                 SQLPOINTER rgbValue,
                 SQLLEN cbValueMax,
                 SQLLEN *pcbValue),
                (override));

    // New methods for diagnostics handling
    MOCK_METHOD(std::vector<DiagnosticInfo>, GetDiagnostics, (), (const, override));
    MOCK_METHOD(void, ClearDiagnostics, (), (override));

    // Helper methods to make setting up expectations easier
    void SetupSuccessfulConnection()
    {
      EXPECT_CALL(*this, SQLSetConnectAttr(testing::_, testing::_, testing::_, testing::_))
          .Times(testing::AtLeast(1))
          .WillRepeatedly(testing::Return(SQL_SUCCESS));

      EXPECT_CALL(*this, SQLDriverConnect(testing::_, testing::_, testing::_, testing::_,
                                          testing::_, testing::_, testing::_, testing::_))
          .WillOnce(testing::Return(SQL_SUCCESS));

      EXPECT_CALL(*this, GetDiagnostics())
          .WillRepeatedly(testing::Return(std::vector<DiagnosticInfo>()));
    }

    void SetupFailedConnection(const std::string &sqlState, const std::string &message, int nativeError)
    {
      EXPECT_CALL(*this, SQLSetConnectAttr(testing::_, testing::_, testing::_, testing::_))
          .Times(testing::AtLeast(1))
          .WillRepeatedly(testing::Return(SQL_SUCCESS));

      EXPECT_CALL(*this, SQLDriverConnect(testing::_, testing::_, testing::_, testing::_,
                                          testing::_, testing::_, testing::_, testing::_))
          .WillOnce(testing::Return(SQL_ERROR));

      std::vector<DiagnosticInfo> diags = {
          {sqlState, nativeError, message}};

      EXPECT_CALL(*this, GetDiagnostics())
          .WillRepeatedly(testing::Return(diags));
    }
  };
}