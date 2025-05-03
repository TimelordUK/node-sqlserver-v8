#pragma once

#include <sql.h>
#include <sqlext.h>
#include <memory>
#include <vector>

namespace mssql
{

    class IOdbcApi
    {
    public:
        virtual ~IOdbcApi() = default;

        // Connection methods
        virtual SQLRETURN SQLDisconnect(SQLHDBC ConnectionHandle) = 0;

        virtual SQLRETURN SQLSetConnectAttr(
            SQLHDBC ConnectionHandle,
            SQLINTEGER Attribute,
            SQLPOINTER Value,
            SQLINTEGER StringLength) = 0;

        virtual SQLRETURN SQLDriverConnect(
            SQLHDBC ConnectionHandle,
            SQLHWND WindowHandle,
            SQLWCHAR* InConnectionString,
            SQLSMALLINT StringLength1,
            SQLWCHAR* OutConnectionString,
            SQLSMALLINT BufferLength,
            SQLSMALLINT* StringLength2Ptr,
            SQLUSMALLINT DriverCompletion) = 0;

        // Statement methods - always use the 'W' versions
        virtual SQLRETURN SQLExecute(SQLHSTMT StatementHandle) = 0;
        virtual SQLRETURN SQLNumResultCols(SQLHSTMT StatementHandle, SQLSMALLINT* ColumnCount) = 0;
        virtual SQLRETURN SQLPrepareW(SQLHSTMT StatementHandle, SQLWCHAR* StatementText, SQLINTEGER TextLength) = 0;
        virtual SQLRETURN SQLDescribeColW(SQLHSTMT StatementHandle,
            SQLUSMALLINT ColumnNumber,
            SQLWCHAR* ColumnName,
            SQLSMALLINT BufferLength,
            SQLSMALLINT* NameLength,
            SQLSMALLINT* DataType,
            SQLULEN* ColumnSize,
            SQLSMALLINT* DecimalDigits,
            SQLSMALLINT* Nullable) = 0;
        virtual SQLRETURN SQLFetch(SQLHSTMT StatementHandle) = 0;
        virtual SQLRETURN SQLGetData(SQLHSTMT StatementHandle,
            SQLUSMALLINT ColumnNumber,
            SQLSMALLINT TargetType,
            SQLPOINTER TargetValue,
            SQLLEN BufferLength,
            SQLLEN* StrLen_or_Ind) = 0;

        virtual SQLRETURN SQLBindParameter(
            SQLHSTMT           hstmt,
            SQLUSMALLINT       ipar,
            SQLSMALLINT        fParamType,
            SQLSMALLINT        fCType,
            SQLSMALLINT        fSqlType,
            SQLULEN            cbColDef,
            SQLSMALLINT        ibScale,
            SQLPOINTER         rgbValue,
            SQLLEN             cbValueMax,
            SQLLEN* pcbValue) = 0;
    };

  // Concrete implementation that forwards to actual ODBC
    class RealOdbcApi : public IOdbcApi
    {
    public:
        // Connection methods
        SQLRETURN SQLDisconnect(SQLHDBC ConnectionHandle) override
        {
            return ::SQLDisconnect(ConnectionHandle);
        }

        SQLRETURN SQLSetConnectAttr(
            SQLHDBC ConnectionHandle,
            SQLINTEGER Attribute,
            SQLPOINTER Value,
            SQLINTEGER StringLength) override
        {
            return ::SQLSetConnectAttr(ConnectionHandle, Attribute, Value, StringLength);
        }

        SQLRETURN SQLDriverConnect(
            SQLHDBC ConnectionHandle,
            SQLHWND WindowHandle,
            SQLWCHAR* InConnectionString,
            SQLSMALLINT StringLength1,
            SQLWCHAR* OutConnectionString,
            SQLSMALLINT BufferLength,
            SQLSMALLINT* StringLength2Ptr,
            SQLUSMALLINT DriverCompletion) override
        {
            return ::SQLDriverConnect(
                ConnectionHandle,
                WindowHandle,
                InConnectionString,
                StringLength1,
                OutConnectionString,
                BufferLength,
                StringLength2Ptr,
                DriverCompletion);
        }

        // Statement methods
        SQLRETURN SQLExecute(SQLHSTMT StatementHandle) override {
            return ::SQLExecute(StatementHandle);
        }

        SQLRETURN SQLNumResultCols(SQLHSTMT StatementHandle, SQLSMALLINT* ColumnCount) override {
            return ::SQLNumResultCols(StatementHandle, ColumnCount);
        }

        SQLRETURN SQLPrepareW(SQLHSTMT StatementHandle, SQLWCHAR* StatementText, SQLINTEGER TextLength) override
        {
            return ::SQLPrepareW(StatementHandle, StatementText, TextLength);
        }

        SQLRETURN SQLDescribeColW(SQLHSTMT StatementHandle, SQLUSMALLINT ColumnNumber, SQLWCHAR* ColumnName,
            SQLSMALLINT BufferLength, SQLSMALLINT* NameLength, SQLSMALLINT* DataType,
            SQLULEN* ColumnSize, SQLSMALLINT* DecimalDigits, SQLSMALLINT* Nullable) override
        {
            return ::SQLDescribeColW(StatementHandle, ColumnNumber, ColumnName, BufferLength, NameLength,
                DataType, ColumnSize, DecimalDigits, Nullable);
        }

        SQLRETURN SQLFetch(SQLHSTMT StatementHandle) override {
            return ::SQLFetch(StatementHandle);
        }

        SQLRETURN SQLGetData(SQLHSTMT StatementHandle, SQLUSMALLINT ColumnNumber, SQLSMALLINT TargetType,
            SQLPOINTER TargetValue, SQLLEN BufferLength, SQLLEN* StrLen_or_Ind) override {
            return ::SQLGetData(StatementHandle, ColumnNumber, TargetType, TargetValue, BufferLength, StrLen_or_Ind);
        }

        SQLRETURN SQLBindParameter(
            SQLHSTMT           hstmt,
            SQLUSMALLINT       ipar,
            SQLSMALLINT        fParamType,
            SQLSMALLINT        fCType,
            SQLSMALLINT        fSqlType,
            SQLULEN            cbColDef,
            SQLSMALLINT        ibScale,
            SQLPOINTER         rgbValue,
            SQLLEN             cbValueMax,
            SQLLEN* pcbValue) override
        {
            return ::SQLBindParameter(hstmt, ipar, fParamType, fCType, fSqlType, cbColDef, ibScale, rgbValue, cbValueMax, pcbValue);
        }
    };

}