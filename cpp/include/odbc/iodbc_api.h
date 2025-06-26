// OdbcApi.h
#pragma once

#include <sql.h>
#include <sqlext.h>

#include <memory>
#include <string>
#include <vector>

#include "Logger.h"

namespace mssql {
// Helper function to convert ODBC return codes to readable strings
std::string GetSqlReturnCodeString(SQLRETURN returnCode);

// Convert wide string to regular string for logging
std::string WideToUtf8(const SQLWCHAR* wstr, int length = -1);

// Helper to log ODBC errors from a handle
void LogOdbcError(SQLSMALLINT handleType, SQLHANDLE handle, const std::string& context);

// Structure to store diagnostic information
struct DiagnosticInfo {
  std::string sqlState;
  int nativeError;
  std::string message;
};

class IOdbcApi {
 public:
  virtual ~IOdbcApi() = default;

  // Environment methods
  virtual SQLRETURN SQLSetEnvAttr(SQLHENV EnvironmentHandle,
                                  SQLINTEGER Attribute,
                                  SQLPOINTER Value,
                                  SQLINTEGER StringLength) = 0;

  // Connection methods
  virtual SQLRETURN SQLDisconnect(SQLHDBC ConnectionHandle) = 0;

  virtual SQLRETURN SQLSetConnectAttr(SQLHDBC ConnectionHandle,
                                      SQLINTEGER Attribute,
                                      SQLPOINTER Value,
                                      SQLINTEGER StringLength) = 0;

  virtual SQLRETURN SQLDriverConnect(SQLHDBC ConnectionHandle,
                                     SQLHWND WindowHandle,
                                     SQLWCHAR* InConnectionString,
                                     SQLSMALLINT StringLength1,
                                     SQLWCHAR* OutConnectionString,
                                     SQLSMALLINT BufferLength,
                                     SQLSMALLINT* StringLength2Ptr,
                                     SQLUSMALLINT DriverCompletion) = 0;

  virtual SQLRETURN SQLExecDirectW(SQLHSTMT hstmt, SQLWCHAR* szSqlStr, SQLINTEGER TextLength) = 0;

  // Statement methods - always use the 'W' versions
  virtual SQLRETURN SQLExecute(SQLHSTMT StatementHandle) = 0;
  virtual SQLRETURN SQLNumResultCols(SQLHSTMT StatementHandle, SQLSMALLINT* ColumnCount) = 0;
  virtual SQLRETURN SQLPrepareW(SQLHSTMT StatementHandle,
                                SQLWCHAR* StatementText,
                                SQLINTEGER TextLength) = 0;
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

  virtual SQLRETURN SQLBindParameter(SQLHSTMT hstmt,
                                     SQLUSMALLINT ipar,
                                     SQLSMALLINT fParamType,
                                     SQLSMALLINT fCType,
                                     SQLSMALLINT fSqlType,
                                     SQLULEN cbColDef,
                                     SQLSMALLINT ibScale,
                                     SQLPOINTER rgbValue,
                                     SQLLEN cbValueMax,
                                     SQLLEN* pcbValue) = 0;

  // Add SQLFetchScroll to the interface
  virtual SQLRETURN SQLFetchScroll(SQLHSTMT StatementHandle,
                                   SQLSMALLINT FetchOrientation,
                                   SQLLEN FetchOffset) = 0;

  // Use SQLSetStmtAttrW for consistency across platforms
  virtual SQLRETURN SQLSetStmtAttrW(SQLHSTMT StatementHandle,
                                    SQLINTEGER Attribute,
                                    SQLPOINTER Value,
                                    SQLINTEGER StringLength) = 0;

  // Add SQLMoreResults to the interface
  virtual SQLRETURN SQLMoreResults(SQLHSTMT StatementHandle) = 0;

  // Add SQLGetDiagRecW to the interface
  virtual SQLRETURN SQLGetDiagRecW(SQLSMALLINT HandleType,
                                   SQLHANDLE Handle,
                                   SQLSMALLINT RecNumber,
                                   SQLWCHAR* SQLState,
                                   SQLINTEGER* NativeErrorPtr,
                                   SQLWCHAR* MessageText,
                                   SQLSMALLINT BufferLength,
                                   SQLSMALLINT* TextLengthPtr) = 0;

  // Add SQLColAttributeW to the interface
  virtual SQLRETURN SQLColAttributeW(SQLHSTMT StatementHandle,
                                     SQLUSMALLINT ColumnNumber,
                                     SQLUSMALLINT FieldIdentifier,
                                     SQLPOINTER CharacterAttributePtr,
                                     SQLSMALLINT BufferLength,
                                     SQLSMALLINT* StringLengthPtr,
                                     SQLLEN* NumericAttributePtr) = 0;

  // Add SQLGetStmtAttr to the interface
  virtual SQLRETURN SQLGetStmtAttr(SQLHSTMT StatementHandle,
                                   SQLINTEGER Attribute,
                                   SQLPOINTER Value,
                                   SQLINTEGER BufferLength,
                                   SQLINTEGER* StringLength) = 0;

  // Add SQLSetDescField to the interface
  virtual SQLRETURN SQLSetDescField(SQLHDESC DescriptorHandle,
                                    SQLSMALLINT RecNumber,
                                    SQLSMALLINT FieldIdentifier,
                                    SQLPOINTER Value,
                                    SQLINTEGER BufferLength) = 0;

  // Add SQLRowCount to the interface
  virtual SQLRETURN SQLRowCount(SQLHSTMT StatementHandle, SQLLEN* RowCount) = 0;

  // Add SQLBindCol to the interface
  virtual SQLRETURN SQLBindCol(SQLHSTMT StatementHandle,
                               SQLUSMALLINT ColumnNumber,
                               SQLSMALLINT TargetType,
                               SQLPOINTER TargetValue,
                               SQLLEN BufferLength,
                               SQLLEN* StrLen_or_Ind) = 0;

  // Add SQLCancelHandle to the interface
  virtual SQLRETURN SQLCancelHandle(SQLSMALLINT HandleType, SQLHANDLE Handle) = 0;

  // Add SQLGetDiagField to the interface
  virtual SQLRETURN SQLGetDiagField(SQLSMALLINT HandleType,
                                    SQLHANDLE Handle,
                                    SQLSMALLINT RecNumber,
                                    SQLSMALLINT DiagIdentifier,
                                    SQLPOINTER DiagInfo,
                                    SQLSMALLINT BufferLength,
                                    SQLSMALLINT* StringLength) = 0;

  // Add SQLCloseCursor to the interface
  virtual SQLRETURN SQLCloseCursor(SQLHSTMT StatementHandle) = 0;

  // Add SQLGetDescField to the interface
  virtual SQLRETURN SQLGetDescField(SQLHDESC DescriptorHandle,
                                    SQLSMALLINT RecNumber,
                                    SQLSMALLINT FieldIdentifier,
                                    SQLPOINTER Value,
                                    SQLINTEGER BufferLength,
                                    SQLINTEGER* StringLength) = 0;

  // Method to retrieve diagnostic information
  virtual std::vector<DiagnosticInfo> GetDiagnostics() const = 0;

  // Method to clear diagnostic information
  virtual void ClearDiagnostics() = 0;
};

// Declaration of RealOdbcApi - implementation in separate file
class RealOdbcApi : public IOdbcApi {
 public:
  RealOdbcApi();
  ~RealOdbcApi() override;

  // Environment methods
  SQLRETURN SQLSetEnvAttr(SQLHENV EnvironmentHandle,
                          SQLINTEGER Attribute,
                          SQLPOINTER Value,
                          SQLINTEGER StringLength) override;

  // Connection methods
  SQLRETURN SQLDisconnect(SQLHDBC ConnectionHandle) override;
  SQLRETURN SQLSetConnectAttr(SQLHDBC ConnectionHandle,
                              SQLINTEGER Attribute,
                              SQLPOINTER Value,
                              SQLINTEGER StringLength) override;
  SQLRETURN SQLDriverConnect(SQLHDBC ConnectionHandle,
                             SQLHWND WindowHandle,
                             SQLWCHAR* InConnectionString,
                             SQLSMALLINT StringLength1,
                             SQLWCHAR* OutConnectionString,
                             SQLSMALLINT BufferLength,
                             SQLSMALLINT* StringLength2Ptr,
                             SQLUSMALLINT DriverCompletion) override;

  // Statement methods
  SQLRETURN SQLExecute(SQLHSTMT StatementHandle) override;
  SQLRETURN SQLExecDirectW(SQLHSTMT hstmt, SQLWCHAR* szSqlStr, SQLINTEGER TextLength) override;
  SQLRETURN SQLNumResultCols(SQLHSTMT StatementHandle, SQLSMALLINT* ColumnCount) override;
  SQLRETURN SQLPrepareW(SQLHSTMT StatementHandle,
                        SQLWCHAR* StatementText,
                        SQLINTEGER TextLength) override;
  SQLRETURN SQLDescribeColW(SQLHSTMT StatementHandle,
                            SQLUSMALLINT ColumnNumber,
                            SQLWCHAR* ColumnName,
                            SQLSMALLINT BufferLength,
                            SQLSMALLINT* NameLength,
                            SQLSMALLINT* DataType,
                            SQLULEN* ColumnSize,
                            SQLSMALLINT* DecimalDigits,
                            SQLSMALLINT* Nullable) override;
  SQLRETURN SQLFetch(SQLHSTMT StatementHandle) override;
  SQLRETURN SQLGetData(SQLHSTMT StatementHandle,
                       SQLUSMALLINT ColumnNumber,
                       SQLSMALLINT TargetType,
                       SQLPOINTER TargetValue,
                       SQLLEN BufferLength,
                       SQLLEN* StrLen_or_Ind) override;
  SQLRETURN SQLBindParameter(SQLHSTMT hstmt,
                             SQLUSMALLINT ipar,
                             SQLSMALLINT fParamType,
                             SQLSMALLINT fCType,
                             SQLSMALLINT fSqlType,
                             SQLULEN cbColDef,
                             SQLSMALLINT ibScale,
                             SQLPOINTER rgbValue,
                             SQLLEN cbValueMax,
                             SQLLEN* pcbValue) override;
  SQLRETURN SQLFetchScroll(SQLHSTMT StatementHandle,
                           SQLSMALLINT FetchOrientation,
                           SQLLEN FetchOffset) override;
  SQLRETURN SQLSetStmtAttrW(SQLHSTMT StatementHandle,
                            SQLINTEGER Attribute,
                            SQLPOINTER Value,
                            SQLINTEGER StringLength) override;
  SQLRETURN SQLMoreResults(SQLHSTMT StatementHandle) override;

  // New ODBC methods
  SQLRETURN SQLGetDiagRecW(SQLSMALLINT HandleType,
                           SQLHANDLE Handle,
                           SQLSMALLINT RecNumber,
                           SQLWCHAR* SQLState,
                           SQLINTEGER* NativeErrorPtr,
                           SQLWCHAR* MessageText,
                           SQLSMALLINT BufferLength,
                           SQLSMALLINT* TextLengthPtr) override;
  SQLRETURN SQLColAttributeW(SQLHSTMT StatementHandle,
                             SQLUSMALLINT ColumnNumber,
                             SQLUSMALLINT FieldIdentifier,
                             SQLPOINTER CharacterAttributePtr,
                             SQLSMALLINT BufferLength,
                             SQLSMALLINT* StringLengthPtr,
                             SQLLEN* NumericAttributePtr) override;

  SQLRETURN SQLGetStmtAttr(SQLHSTMT StatementHandle,
                           SQLINTEGER Attribute,
                           SQLPOINTER Value,
                           SQLINTEGER BufferLength,
                           SQLINTEGER* StringLength) override;

  SQLRETURN SQLSetDescField(SQLHDESC DescriptorHandle,
                            SQLSMALLINT RecNumber,
                            SQLSMALLINT FieldIdentifier,
                            SQLPOINTER Value,
                            SQLINTEGER BufferLength) override;

  SQLRETURN SQLRowCount(SQLHSTMT StatementHandle, SQLLEN* RowCount) override;

  SQLRETURN SQLBindCol(SQLHSTMT StatementHandle,
                       SQLUSMALLINT ColumnNumber,
                       SQLSMALLINT TargetType,
                       SQLPOINTER TargetValue,
                       SQLLEN BufferLength,
                       SQLLEN* StrLen_or_Ind) override;

  SQLRETURN SQLCancelHandle(SQLSMALLINT HandleType, SQLHANDLE Handle) override;

  SQLRETURN SQLGetDiagField(SQLSMALLINT HandleType,
                            SQLHANDLE Handle,
                            SQLSMALLINT RecNumber,
                            SQLSMALLINT DiagIdentifier,
                            SQLPOINTER DiagInfo,
                            SQLSMALLINT BufferLength,
                            SQLSMALLINT* StringLength) override;

  SQLRETURN SQLCloseCursor(SQLHSTMT StatementHandle) override;

  SQLRETURN SQLGetDescField(SQLHDESC DescriptorHandle,
                            SQLSMALLINT RecNumber,
                            SQLSMALLINT FieldIdentifier,
                            SQLPOINTER Value,
                            SQLINTEGER BufferLength,
                            SQLINTEGER* StringLength) override;


  // Diagnostic methods
  std::vector<DiagnosticInfo> GetDiagnostics() const override;
  void ClearDiagnostics() override;

 private:
  // Helper methods for connection diagnostics
  std::string GetDriverInfoFromConnectionString(const std::string& connStr);
  std::string GetServerFromConnectionString(const std::string& connStr);
  bool IsDriverInstalled(const std::string& driverName);
  bool IsServerReachable(const std::string& server);
  std::wstring SanitizeConnectionString(const std::wstring& connectionString);
  void DiagnoseConnectionString(const std::wstring& connectionString);

  // Storage for diagnostic information
  std::vector<DiagnosticInfo> diagInfoList;
};
}  // namespace mssql