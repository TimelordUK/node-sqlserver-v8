// OdbcApi.h
#pragma once

#include <sql.h>
#include <sqlext.h>
#include <memory>
#include <vector>
#include <string>
#include "Logger.h"

namespace mssql
{
  // Helper function to convert ODBC return codes to readable strings
  std::string GetSqlReturnCodeString(SQLRETURN returnCode);

  // Convert wide string to regular string for logging
  std::string WideToUtf8(const SQLWCHAR *wstr, int length = -1);

  // Helper to log ODBC errors from a handle
  void LogOdbcError(SQLSMALLINT handleType, SQLHANDLE handle, const std::string &context);

  // Structure to store diagnostic information
  struct DiagnosticInfo
  {
    std::string sqlState;
    int nativeError;
    std::string message;
  };

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
        SQLWCHAR *InConnectionString,
        SQLSMALLINT StringLength1,
        SQLWCHAR *OutConnectionString,
        SQLSMALLINT BufferLength,
        SQLSMALLINT *StringLength2Ptr,
        SQLUSMALLINT DriverCompletion) = 0;

    virtual SQLRETURN SQLExecDirectW(
        SQLHSTMT hstmt,
        SQLWCHAR *szSqlStr,
        SQLINTEGER TextLength) = 0;

    // Statement methods - always use the 'W' versions
    virtual SQLRETURN SQLExecute(SQLHSTMT StatementHandle) = 0;
    virtual SQLRETURN SQLNumResultCols(SQLHSTMT StatementHandle, SQLSMALLINT *ColumnCount) = 0;
    virtual SQLRETURN SQLPrepareW(SQLHSTMT StatementHandle, SQLWCHAR *StatementText, SQLINTEGER TextLength) = 0;
    virtual SQLRETURN SQLDescribeColW(SQLHSTMT StatementHandle,
                                      SQLUSMALLINT ColumnNumber,
                                      SQLWCHAR *ColumnName,
                                      SQLSMALLINT BufferLength,
                                      SQLSMALLINT *NameLength,
                                      SQLSMALLINT *DataType,
                                      SQLULEN *ColumnSize,
                                      SQLSMALLINT *DecimalDigits,
                                      SQLSMALLINT *Nullable) = 0;
    virtual SQLRETURN SQLFetch(SQLHSTMT StatementHandle) = 0;

    virtual SQLRETURN SQLGetData(SQLHSTMT StatementHandle,
                                 SQLUSMALLINT ColumnNumber,
                                 SQLSMALLINT TargetType,
                                 SQLPOINTER TargetValue,
                                 SQLLEN BufferLength,
                                 SQLLEN *StrLen_or_Ind) = 0;

    virtual SQLRETURN SQLBindParameter(
        SQLHSTMT hstmt,
        SQLUSMALLINT ipar,
        SQLSMALLINT fParamType,
        SQLSMALLINT fCType,
        SQLSMALLINT fSqlType,
        SQLULEN cbColDef,
        SQLSMALLINT ibScale,
        SQLPOINTER rgbValue,
        SQLLEN cbValueMax,
        SQLLEN *pcbValue) = 0;

    // Add SQLFetchScroll to the interface
    virtual SQLRETURN SQLFetchScroll(
        SQLHSTMT StatementHandle,
        SQLSMALLINT FetchOrientation,
        SQLLEN FetchOffset) = 0;

    // Add SQLSetStmtAttr if not already present
    virtual SQLRETURN SQLSetStmtAttrW(
        SQLHSTMT StatementHandle,
        SQLINTEGER Attribute,
        SQLPOINTER Value,
        SQLINTEGER StringLength) = 0;

    // Add SQLMoreResults to the interface
    virtual SQLRETURN SQLMoreResults(SQLHSTMT StatementHandle) = 0;

    // Method to retrieve diagnostic information
    virtual std::vector<DiagnosticInfo> GetDiagnostics() const = 0;

    // Method to clear diagnostic information
    virtual void ClearDiagnostics() = 0;
  };

  // Declaration of RealOdbcApi - implementation in separate file
  class RealOdbcApi : public IOdbcApi
  {
  public:
    RealOdbcApi();
    ~RealOdbcApi();

    // Connection methods
    SQLRETURN SQLDisconnect(SQLHDBC ConnectionHandle) override;
    SQLRETURN SQLSetConnectAttr(SQLHDBC ConnectionHandle, SQLINTEGER Attribute, SQLPOINTER Value, SQLINTEGER StringLength) override;
    SQLRETURN SQLDriverConnect(SQLHDBC ConnectionHandle, SQLHWND WindowHandle, SQLWCHAR *InConnectionString, SQLSMALLINT StringLength1,
                               SQLWCHAR *OutConnectionString, SQLSMALLINT BufferLength, SQLSMALLINT *StringLength2Ptr, SQLUSMALLINT DriverCompletion) override;

    // Statement methods
    SQLRETURN SQLExecute(SQLHSTMT StatementHandle) override;
    SQLRETURN SQLExecDirectW(SQLHSTMT hstmt, SQLWCHAR *szSqlStr, SQLINTEGER TextLength) override;
    SQLRETURN SQLNumResultCols(SQLHSTMT StatementHandle, SQLSMALLINT *ColumnCount) override;
    SQLRETURN SQLPrepareW(SQLHSTMT StatementHandle, SQLWCHAR *StatementText, SQLINTEGER TextLength) override;
    SQLRETURN SQLDescribeColW(SQLHSTMT StatementHandle, SQLUSMALLINT ColumnNumber, SQLWCHAR *ColumnName,
                              SQLSMALLINT BufferLength, SQLSMALLINT *NameLength, SQLSMALLINT *DataType,
                              SQLULEN *ColumnSize, SQLSMALLINT *DecimalDigits, SQLSMALLINT *Nullable) override;
    SQLRETURN SQLFetch(SQLHSTMT StatementHandle) override;
    SQLRETURN SQLGetData(SQLHSTMT StatementHandle, SQLUSMALLINT ColumnNumber, SQLSMALLINT TargetType,
                         SQLPOINTER TargetValue, SQLLEN BufferLength, SQLLEN *StrLen_or_Ind) override;
    SQLRETURN SQLBindParameter(SQLHSTMT hstmt, SQLUSMALLINT ipar, SQLSMALLINT fParamType, SQLSMALLINT fCType,
                               SQLSMALLINT fSqlType, SQLULEN cbColDef, SQLSMALLINT ibScale, SQLPOINTER rgbValue,
                               SQLLEN cbValueMax, SQLLEN *pcbValue) override;
    SQLRETURN SQLFetchScroll(SQLHSTMT StatementHandle, SQLSMALLINT FetchOrientation, SQLLEN FetchOffset) override;
    SQLRETURN SQLSetStmtAttrW(SQLHSTMT StatementHandle, SQLINTEGER Attribute, SQLPOINTER Value, SQLINTEGER StringLength) override;
    SQLRETURN SQLMoreResults(SQLHSTMT StatementHandle) override;


    // Diagnostic methods
    std::vector<DiagnosticInfo> GetDiagnostics() const override;
    void ClearDiagnostics() override;

  private:
    // Helper methods for connection diagnostics
    std::string GetDriverInfoFromConnectionString(const std::string &connStr);
    std::string GetServerFromConnectionString(const std::string &connStr);
    bool IsDriverInstalled(const std::string &driverName);
    bool IsServerReachable(const std::string &server);
    std::wstring SanitizeConnectionString(const std::wstring &connectionString);
    void DiagnoseConnectionString(const std::wstring &connectionString);

    // Storage for diagnostic information
    std::vector<DiagnosticInfo> diagInfoList;
  };
} // namespace mssql