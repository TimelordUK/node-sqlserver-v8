// OdbcApi.cpp
#include "platform.h"
#include "odbc_common.h"
#include "iodbc_api.h"
#include <sstream>
#include <iomanip>
#include <cctype>

namespace mssql
{
  // Helper function implementations
  std::string GetSqlReturnCodeString(SQLRETURN returnCode)
  {
    switch (returnCode)
    {
    case SQL_SUCCESS:
      return "SQL_SUCCESS";
    case SQL_SUCCESS_WITH_INFO:
      return "SQL_SUCCESS_WITH_INFO";
    case SQL_ERROR:
      return "SQL_ERROR";
    case SQL_INVALID_HANDLE:
      return "SQL_INVALID_HANDLE";
    case SQL_NO_DATA:
      return "SQL_NO_DATA";
    case SQL_NEED_DATA:
      return "SQL_NEED_DATA";
    case SQL_STILL_EXECUTING:
      return "SQL_STILL_EXECUTING";
    case SQL_PARAM_DATA_AVAILABLE:
      return "SQL_PARAM_DATA_AVAILABLE";
    default:
      return "UNKNOWN_RETURN_CODE(" + std::to_string(returnCode) + ")";
    }
  }

  std::string WideToUtf8(const SQLWCHAR *wstr, int length)
  {
    if (!wstr)
      return "null";

    if (length == -1)
    {
      // Find the length
      length = 0;
      while (wstr[length] != 0)
        length++;
    }

    // Simple conversion for ASCII compatible characters
    std::string result;
    result.reserve(length);

    for (int i = 0; i < length && wstr[i] != 0; i++)
    {
      if (wstr[i] <= 127)
      {
        result.push_back(static_cast<char>(wstr[i]));
      }
      else
      {
        result.push_back('?'); // Replace non-ASCII with question mark
      }
    }

    return result;
  }

  void LogOdbcError(SQLSMALLINT handleType, SQLHANDLE handle, const std::string &context)
  {
    SQLWCHAR sqlState[SQL_SQLSTATE_SIZE + 1];
    SQLWCHAR message[SQL_MAX_MESSAGE_LENGTH];
    SQLINTEGER nativeError;
    SQLSMALLINT length;

    SQLRETURN ret = SQLGetDiagRecW(
        handleType,
        handle,
        1,
        sqlState,
        &nativeError,
        message,
        SQL_MAX_MESSAGE_LENGTH,
        &length);

    if (SQL_SUCCEEDED(ret))
    {
      SQL_LOG_ERROR_STREAM(context << " - SQLSTATE: " << WideToUtf8(sqlState)
                                   << ", Native Error: " << nativeError
                                   << ", Message: " << WideToUtf8(message));
    }
    else
    {
      SQL_LOG_ERROR_STREAM(context << " - Error getting diagnostic info: " << GetSqlReturnCodeString(ret));
    }
  }

  // RealOdbcApi implementation
  RealOdbcApi::RealOdbcApi()
  {
    // Constructor - initialize any needed resources
  }

  RealOdbcApi::~RealOdbcApi()
  {
    // Destructor - clean up any resources
  }

  std::vector<DiagnosticInfo> RealOdbcApi::GetDiagnostics() const
  {
    return diagInfoList;
  }

  void RealOdbcApi::ClearDiagnostics()
  {
    diagInfoList.clear();
  }

  std::wstring RealOdbcApi::SanitizeConnectionString(const std::wstring &originalConnStr)
  {
    std::wstring cleanConnStr;
    cleanConnStr.reserve(originalConnStr.size());

    // Copy only valid characters
    for (wchar_t c : originalConnStr)
    {
      // Only include printable ASCII and some common Unicode characters
      if ((c >= 32 && c <= 126) ||        // ASCII printable
          (c >= 0x0080 && c <= 0x00FF) || // Latin-1 Supplement
          (c >= 0x0100 && c <= 0x017F))   // Latin Extended-A
      {
        cleanConnStr.push_back(c);
      }
      else
      {
        // Log the invalid character we're skipping
        SQL_LOG_WARNING_STREAM("Skipping invalid character in connection string, code point: "
                               << std::hex << static_cast<int>(c));
      }
    }

    // Ensure the string is properly terminated
    if (!cleanConnStr.empty() && cleanConnStr.back() != L';')
    {
      cleanConnStr.push_back(L';');
    }

    return cleanConnStr;
  }

  void RealOdbcApi::DiagnoseConnectionString(const std::wstring &connectionString)
  {
    SQL_LOG_DEBUG("Diagnosing connection string...");

    // Check total length
    SQL_LOG_DEBUG_STREAM("Connection string length: " << connectionString.length() << " characters");

    // Convert to UTF-8 for logging and check each character
    std::string utf8Conn;
    utf8Conn.reserve(connectionString.length() * 3); // Worst-case expansion

    for (size_t i = 0; i < connectionString.length(); i++)
    {
      wchar_t c = connectionString[i];

      // Check for control characters or non-printable characters
      if (c < 32 || c > 126)
      {
        SQL_LOG_ERROR_STREAM("Invalid character at position " << i
                                                              << ": Unicode " << static_cast<int>(c)
                                                              << " (hex: 0x" << std::hex << static_cast<int>(c) << std::dec << ")");
      }

      // Convert to UTF-8 (simple conversion for logging)
      if (c <= 127)
      {
        utf8Conn.push_back(static_cast<char>(c));
      }
      else if (c <= 2047)
      {
        utf8Conn.push_back(static_cast<char>(192 | (c >> 6)));
        utf8Conn.push_back(static_cast<char>(128 | (c & 63)));
      }
      else
      {
        utf8Conn.push_back(static_cast<char>(224 | (c >> 12)));
        utf8Conn.push_back(static_cast<char>(128 | ((c >> 6) & 63)));
        utf8Conn.push_back(static_cast<char>(128 | (c & 63)));
      }
    }

    // Sanitize password for logging
    size_t pwdStart = utf8Conn.find("PWD=");
    if (pwdStart != std::string::npos)
    {
      size_t pwdEnd = utf8Conn.find(";", pwdStart);
      if (pwdEnd != std::string::npos)
      {
        utf8Conn.replace(pwdStart, pwdEnd - pwdStart, "PWD=********");
      }
      else
      {
        utf8Conn.replace(pwdStart, utf8Conn.length() - pwdStart, "PWD=********");
      }
    }

    // Log the sanitized connection string with character positions
    SQL_LOG_DEBUG("Connection string contents (sanitized):");
    for (size_t i = 0; i < utf8Conn.length(); i += 80)
    {
      std::string chunk = utf8Conn.substr(i, 80);
      SQL_LOG_DEBUG_STREAM(std::setw(4) << i << ": " << chunk);
    }
  }

  SQLRETURN RealOdbcApi::SQLDisconnect(SQLHDBC ConnectionHandle)
  {
    SQL_LOG_TRACE_STREAM("SQLDisconnect called for handle: " << ConnectionHandle);
    SQLRETURN ret = ::SQLDisconnect(ConnectionHandle);
    SQL_LOG_TRACE_STREAM("SQLDisconnect returned: " << GetSqlReturnCodeString(ret));

    if (!SQL_SUCCEEDED(ret))
    {
      LogOdbcError(SQL_HANDLE_DBC, ConnectionHandle, "SQLDisconnect failed");
    }

    return ret;
  }

  SQLRETURN RealOdbcApi::SQLSetConnectAttr(
      SQLHDBC ConnectionHandle,
      SQLINTEGER Attribute,
      SQLPOINTER Value,
      SQLINTEGER StringLength)
  {
    // Log attribute name for better readability
    std::string attributeName;
    switch (Attribute)
    {
    case SQL_ATTR_AUTOCOMMIT:
      attributeName = "SQL_ATTR_AUTOCOMMIT";
      break;
    case SQL_ATTR_TXN_ISOLATION:
      attributeName = "SQL_ATTR_TXN_ISOLATION";
      break;
    case SQL_ATTR_CONNECTION_TIMEOUT:
      attributeName = "SQL_ATTR_CONNECTION_TIMEOUT";
      break;
    case SQL_ATTR_LOGIN_TIMEOUT:
      attributeName = "SQL_ATTR_LOGIN_TIMEOUT";
      break;
    // Add more attributes as needed
    default:
      attributeName = "Unknown(" + std::to_string(Attribute) + ")";
    }

    SQL_LOG_TRACE_STREAM("SQLSetConnectAttr called - Handle: " << ConnectionHandle
                                                               << ", Attribute: " << attributeName
                                                               << ", Value: " << Value
                                                               << ", StringLength: " << StringLength);

    SQLRETURN ret = ::SQLSetConnectAttr(ConnectionHandle, Attribute, Value, StringLength);
    SQL_LOG_TRACE_STREAM("SQLSetConnectAttr returned: " << GetSqlReturnCodeString(ret));

    if (!SQL_SUCCEEDED(ret))
    {
      LogOdbcError(SQL_HANDLE_DBC, ConnectionHandle, "SQLSetConnectAttr failed");
    }

    return ret;
  }

  SQLRETURN RealOdbcApi::SQLDriverConnect(
      SQLHDBC ConnectionHandle,
      SQLHWND WindowHandle,
      SQLWCHAR *InConnectionString,
      SQLSMALLINT StringLength1,
      SQLWCHAR *OutConnectionString,
      SQLSMALLINT BufferLength,
      SQLSMALLINT *StringLength2Ptr,
      SQLUSMALLINT DriverCompletion)
  {
    // Clear previous diagnostics
    ClearDiagnostics();

    // Log the original connection string (sanitized for password)
    std::wstring originalConnStr;
    if (InConnectionString)
    {
      // Proper way to convert SQLWCHAR* to std::wstring
      originalConnStr = std::wstring(reinterpret_cast<wchar_t *>(InConnectionString));
    }
    std::string safeConnStr = WideToUtf8(InConnectionString);

    // Sanitize for password logging
    size_t pwdStart = safeConnStr.find("PWD=");
    if (pwdStart != std::string::npos)
    {
      size_t pwdEnd = safeConnStr.find(";", pwdStart);
      if (pwdEnd != std::string::npos)
      {
        safeConnStr.replace(pwdStart, pwdEnd - pwdStart, "PWD=********");
      }
      else
      {
        safeConnStr.replace(pwdStart, safeConnStr.length() - pwdStart, "PWD=********");
      }
    }

    SQL_LOG_DEBUG_STREAM("SQLDriverConnect called - Handle: " << ConnectionHandle
                                                              << ", Connection String: " << safeConnStr
                                                              << ", StringLength1: " << StringLength1
                                                              << ", BufferLength: " << BufferLength
                                                              << ", DriverCompletion: " << DriverCompletion);

    // Diagnose connection string to detect invalid characters
    DiagnoseConnectionString(originalConnStr);

    // Sanitize the connection string to remove invalid characters
    std::wstring cleanConnStr = SanitizeConnectionString(originalConnStr);

    // Log any difference in length
    if (cleanConnStr.length() != originalConnStr.length())
    {
      SQL_LOG_WARNING_STREAM("Connection string was sanitized - original length: "
                             << originalConnStr.length() << ", new length: " << cleanConnStr.length());
    }

    // Create a new connection string buffer from our sanitized string
    std::vector<SQLWCHAR> cleanConnBuffer(cleanConnStr.begin(), cleanConnStr.end());
    cleanConnBuffer.push_back(0); // Ensure null termination

    // Check for malformed connection string
    SQL_LOG_DEBUG("Validating connection string format...");

    // Log if there are non-printing characters in the connection string
    for (size_t i = 0; i < safeConnStr.length(); i++)
    {
      unsigned char c = safeConnStr[i];
      if (c < 32 || c > 126)
      {
        SQL_LOG_ERROR_STREAM("Invalid character found in connection string at position "
                             << i << ": ASCII " << static_cast<int>(c)
                             << " (hex: 0x" << std::hex << static_cast<int>(c) << std::dec << ")");
      }
    }

    // Use the cleaned connection string for the actual call
    SQLRETURN ret = ::SQLDriverConnect(
        ConnectionHandle,
        WindowHandle,
        cleanConnBuffer.data(),
        static_cast<SQLSMALLINT>(cleanConnStr.length()),
        OutConnectionString,
        BufferLength,
        StringLength2Ptr,
        DriverCompletion);

    SQL_LOG_DEBUG_STREAM("SQLDriverConnect returned: " << GetSqlReturnCodeString(ret));

    // Detailed error diagnostics regardless of return code
    SQLWCHAR sqlState[SQL_SQLSTATE_SIZE + 1];
    SQLWCHAR message[SQL_MAX_MESSAGE_LENGTH];
    SQLINTEGER nativeError;
    SQLSMALLINT length;
    SQLSMALLINT recNumber = 1;

    SQL_LOG_DEBUG("Retrieving diagnostic records...");

    // Loop through all available diagnostic records
    while (SQLGetDiagRecW(
               SQL_HANDLE_DBC,
               ConnectionHandle,
               recNumber,
               sqlState,
               &nativeError,
               message,
               SQL_MAX_MESSAGE_LENGTH,
               &length) == SQL_SUCCESS)
    {
      std::string stateTxt = WideToUtf8(sqlState);
      std::string msgTxt = WideToUtf8(message);

      SQL_LOG_ERROR_STREAM("ODBC Diagnostic #" << recNumber
                                               << " - SQLSTATE: " << stateTxt
                                               << ", Native Error: " << nativeError
                                               << ", Message: " << msgTxt);

      // Store diagnostics for error propagation
      DiagnosticInfo diag;
      diag.sqlState = stateTxt;
      diag.nativeError = nativeError;
      diag.message = msgTxt;
      diagInfoList.push_back(diag);

      recNumber++;
    }

    // If we got no diagnostic records but received an error
    if (!SQL_SUCCEEDED(ret) && recNumber == 1)
    {
      SQL_LOG_ERROR("No diagnostic information available from driver despite error return");
      SQL_LOG_ERROR_STREAM("Driver: " << GetDriverInfoFromConnectionString(safeConnStr));
      SQL_LOG_ERROR_STREAM("Server: " << GetServerFromConnectionString(safeConnStr));

      // Add a generic diagnostic for error reporting
      DiagnosticInfo diag;
      diag.sqlState = "HY000"; // General error
      diag.nativeError = 0;
      diag.message = "Unknown ODBC error, no diagnostic information available";
      diagInfoList.push_back(diag);
    }

    // Additional specific checks for common issues
    if (!SQL_SUCCEEDED(ret))
    {
      SQL_LOG_DEBUG("Checking for common connection issues...");

      // Check if driver is actually installed
      if (!IsDriverInstalled(GetDriverInfoFromConnectionString(safeConnStr)))
      {
        SQL_LOG_ERROR("The specified ODBC driver does not appear to be installed");
      }

      // Check if server is reachable
      std::string server = GetServerFromConnectionString(safeConnStr);
      if (!IsServerReachable(server))
      {
        SQL_LOG_ERROR_STREAM("Cannot reach the specified server: " << server);
      }
    }

    return ret;
  }

  std::string RealOdbcApi::GetDriverInfoFromConnectionString(const std::string &connStr)
  {
    size_t driverStart = connStr.find("Driver={");
    if (driverStart != std::string::npos)
    {
      size_t contentStart = driverStart + 8; // After "Driver={"
      size_t contentEnd = connStr.find("}", contentStart);
      if (contentEnd != std::string::npos)
      {
        return connStr.substr(contentStart, contentEnd - contentStart);
      }
    }
    return "Unknown Driver";
  }

  std::string RealOdbcApi::GetServerFromConnectionString(const std::string &connStr)
  {
    size_t serverStart = connStr.find("Server=");
    if (serverStart != std::string::npos)
    {
      size_t contentStart = serverStart + 7; // After "Server="
      size_t contentEnd = connStr.find(";", contentStart);
      if (contentEnd != std::string::npos)
      {
        return connStr.substr(contentStart, contentEnd - contentStart);
      }
      else
      {
        return connStr.substr(contentStart);
      }
    }
    return "Unknown Server";
  }

  bool RealOdbcApi::IsDriverInstalled(const std::string &driverName)
  {
    SQLHENV env;
    SQLRETURN ret;

    // Allocate environment handle
    ret = SQLAllocHandle(SQL_HANDLE_ENV, SQL_NULL_HANDLE, &env);
    if (!SQL_SUCCEEDED(ret))
    {
      return false;
    }

    // Set ODBC version
    ret = SQLSetEnvAttr(env, SQL_ATTR_ODBC_VERSION, (SQLPOINTER)SQL_OV_ODBC3, 0);
    if (!SQL_SUCCEEDED(ret))
    {
      SQLFreeHandle(SQL_HANDLE_ENV, env);
      return false;
    }

    // Enumerate drivers
    SQLWCHAR driverDesc[256];
    SQLWCHAR driverAttributes[256];
    SQLSMALLINT driverDescLen, driverAttrLen;
    bool found = false;

    ret = SQLDriversW(env, SQL_FETCH_FIRST, driverDesc, sizeof(driverDesc) / sizeof(SQLWCHAR),
                      &driverDescLen, driverAttributes, sizeof(driverAttributes) / sizeof(SQLWCHAR),
                      &driverAttrLen);

    while (SQL_SUCCEEDED(ret))
    {
      std::string currentDriver = WideToUtf8(driverDesc);
      if (currentDriver == driverName)
      {
        found = true;
        break;
      }

      ret = SQLDriversW(env, SQL_FETCH_NEXT, driverDesc, sizeof(driverDesc) / sizeof(SQLWCHAR),
                        &driverDescLen, driverAttributes, sizeof(driverAttributes) / sizeof(SQLWCHAR),
                        &driverAttrLen);
    }

    SQLFreeHandle(SQL_HANDLE_ENV, env);
    return found;
  }

  bool RealOdbcApi::IsServerReachable(const std::string &server)
  {
    // Extract hostname and port
    std::string hostname = server;
    int port = 1433; // Default SQL Server port

    size_t commaPos = server.find(",");
    if (commaPos != std::string::npos)
    {
      hostname = server.substr(0, commaPos);
      try
      {
        port = std::stoi(server.substr(commaPos + 1));
      }
      catch (...)
      {
        SQL_LOG_ERROR_STREAM("Invalid port format in server string: " << server);
        return false;
      }
    }

    // Check for invalid characters in hostname
    for (char c : hostname)
    {
      if (!isalnum(c) && c != '.' && c != '-' && c != '_')
      {
        SQL_LOG_ERROR_STREAM("Invalid character in hostname: " << c);
        return false;
      }
    }

    // Log the connection attempt
    SQL_LOG_DEBUG_STREAM("Checking connection to " << hostname << " on port " << port);

    // Here you would typically do a socket connection test
    // For now we'll just log information to help debugging
    if (hostname == "localhost" || hostname == "127.0.0.1")
    {
      SQL_LOG_DEBUG("Attempting to connect to local server - check if SQL Server is running");
    }

    return true; // Just a placeholder for the diagnostic function
  }

  SQLRETURN RealOdbcApi::SQLExecDirectW(
      SQLHSTMT hstmt,
      SQLWCHAR *szSqlStr,
      SQLINTEGER TextLength)
  {
    SQL_LOG_TRACE_STREAM("SQLExecDirectW called for handle: " << hstmt
                                                              << ", SQL: " << WideToUtf8(szSqlStr)
                                                              << ", TextLength: " << TextLength);

    SQLRETURN ret = ::SQLExecDirectW(hstmt, szSqlStr, TextLength);
    SQL_LOG_TRACE_STREAM("SQLExecDirectW returned: " << GetSqlReturnCodeString(ret));

    if (!SQL_SUCCEEDED(ret))
    {
      LogOdbcError(SQL_HANDLE_STMT, hstmt, "SQLExecDirectW failed");
    }
    return ret;
  }

  SQLRETURN RealOdbcApi::SQLExecute(SQLHSTMT StatementHandle)
  {
    SQL_LOG_TRACE_STREAM("SQLExecute called for handle: " << StatementHandle);
    SQLRETURN ret = ::SQLExecute(StatementHandle);
    SQL_LOG_TRACE_STREAM("SQLExecute returned: " << GetSqlReturnCodeString(ret));

    if (!SQL_SUCCEEDED(ret))
    {
      LogOdbcError(SQL_HANDLE_STMT, StatementHandle, "SQLExecute failed");
    }

    return ret;
  }

  SQLRETURN RealOdbcApi::SQLNumResultCols(SQLHSTMT StatementHandle, SQLSMALLINT *ColumnCount)
  {
    SQL_LOG_TRACE_STREAM("SQLNumResultCols called for handle: " << StatementHandle);
    SQLRETURN ret = ::SQLNumResultCols(StatementHandle, ColumnCount);

    if (SQL_SUCCEEDED(ret) && ColumnCount)
    {
      SQL_LOG_TRACE_STREAM("SQLNumResultCols returned: " << GetSqlReturnCodeString(ret)
                                                         << ", ColumnCount: " << *ColumnCount);
    }
    else
    {
      SQL_LOG_TRACE_STREAM("SQLNumResultCols returned: " << GetSqlReturnCodeString(ret));

      if (!SQL_SUCCEEDED(ret))
      {
        LogOdbcError(SQL_HANDLE_STMT, StatementHandle, "SQLNumResultCols failed");
      }
    }

    return ret;
  }

  SQLRETURN RealOdbcApi::SQLPrepareW(SQLHSTMT StatementHandle, SQLWCHAR *StatementText, SQLINTEGER TextLength)
  {
    std::string sql = WideToUtf8(StatementText);
    SQL_LOG_TRACE_STREAM("SQLPrepareW called - Handle: " << StatementHandle
                                                         << ", SQL: " << sql
                                                         << ", TextLength: " << TextLength);

    SQLRETURN ret = ::SQLPrepareW(StatementHandle, StatementText, TextLength);
    SQL_LOG_TRACE_STREAM("SQLPrepareW returned: " << GetSqlReturnCodeString(ret));

    if (!SQL_SUCCEEDED(ret))
    {
      LogOdbcError(SQL_HANDLE_STMT, StatementHandle, "SQLPrepareW failed");
    }

    return ret;
  }

  SQLRETURN RealOdbcApi::SQLDescribeColW(SQLHSTMT StatementHandle, SQLUSMALLINT ColumnNumber, SQLWCHAR *ColumnName,
                                         SQLSMALLINT BufferLength, SQLSMALLINT *NameLength, SQLSMALLINT *DataType,
                                         SQLULEN *ColumnSize, SQLSMALLINT *DecimalDigits, SQLSMALLINT *Nullable)
  {
    SQL_LOG_TRACE_STREAM("SQLDescribeColW called - Handle: " << StatementHandle
                                                             << ", ColumnNumber: " << ColumnNumber
                                                             << ", BufferLength: " << BufferLength);

    SQLRETURN ret = ::SQLDescribeColW(StatementHandle, ColumnNumber, ColumnName, BufferLength, NameLength,
                                      DataType, ColumnSize, DecimalDigits, Nullable);

    if (SQL_SUCCEEDED(ret))
    {
      // Convert data type to readable string
      std::string dataTypeStr;
      if (DataType)
      {
        switch (*DataType)
        {
        case SQL_CHAR:
          dataTypeStr = "SQL_CHAR";
          break;
        case SQL_VARCHAR:
          dataTypeStr = "SQL_VARCHAR";
          break;
        case SQL_LONGVARCHAR:
          dataTypeStr = "SQL_LONGVARCHAR";
          break;
        case SQL_WCHAR:
          dataTypeStr = "SQL_WCHAR";
          break;
        case SQL_WVARCHAR:
          dataTypeStr = "SQL_WVARCHAR";
          break;
        case SQL_WLONGVARCHAR:
          dataTypeStr = "SQL_WLONGVARCHAR";
          break;
        case SQL_DECIMAL:
          dataTypeStr = "SQL_DECIMAL";
          break;
        case SQL_NUMERIC:
          dataTypeStr = "SQL_NUMERIC";
          break;
        case SQL_SMALLINT:
          dataTypeStr = "SQL_SMALLINT";
          break;
        case SQL_INTEGER:
          dataTypeStr = "SQL_INTEGER";
          break;
        case SQL_REAL:
          dataTypeStr = "SQL_REAL";
          break;
        case SQL_FLOAT:
          dataTypeStr = "SQL_FLOAT";
          break;
        case SQL_DOUBLE:
          dataTypeStr = "SQL_DOUBLE";
          break;
        case SQL_BIT:
          dataTypeStr = "SQL_BIT";
          break;
        case SQL_TINYINT:
          dataTypeStr = "SQL_TINYINT";
          break;
        case SQL_BIGINT:
          dataTypeStr = "SQL_BIGINT";
          break;
        case SQL_BINARY:
          dataTypeStr = "SQL_BINARY";
          break;
        case SQL_VARBINARY:
          dataTypeStr = "SQL_VARBINARY";
          break;
        case SQL_LONGVARBINARY:
          dataTypeStr = "SQL_LONGVARBINARY";
          break;
        case SQL_TYPE_DATE:
          dataTypeStr = "SQL_TYPE_DATE";
          break;
        case SQL_TYPE_TIME:
          dataTypeStr = "SQL_TYPE_TIME";
          break;
        case SQL_TYPE_TIMESTAMP:
          dataTypeStr = "SQL_TYPE_TIMESTAMP";
          break;
        case SQL_GUID:
          dataTypeStr = "SQL_GUID";
          break;
        default:
          dataTypeStr = "UNKNOWN(" + std::to_string(*DataType) + ")";
        }
      }

      SQL_LOG_TRACE_STREAM("SQLDescribeColW returned: " << GetSqlReturnCodeString(ret)
                                                        << ", Column: " << (ColumnName ? WideToUtf8(ColumnName) : "null")
                                                        << ", NameLength: " << (NameLength ? std::to_string(*NameLength) : "null")
                                                        << ", DataType: " << dataTypeStr
                                                        << ", ColumnSize: " << (ColumnSize ? std::to_string(*ColumnSize) : "null")
                                                        << ", DecimalDigits: " << (DecimalDigits ? std::to_string(*DecimalDigits) : "null")
                                                        << ", Nullable: " << (Nullable ? std::to_string(*Nullable) : "null"));
    }
    else
    {
      SQL_LOG_TRACE_STREAM("SQLDescribeColW returned: " << GetSqlReturnCodeString(ret));
      LogOdbcError(SQL_HANDLE_STMT, StatementHandle, "SQLDescribeColW failed");
    }

    return ret;
  }

  SQLRETURN RealOdbcApi::SQLFetch(SQLHSTMT StatementHandle)
  {
    SQL_LOG_TRACE_STREAM("SQLFetch called for handle: " << StatementHandle);
    SQLRETURN ret = ::SQLFetch(StatementHandle);
    SQL_LOG_TRACE_STREAM("SQLFetch returned: " << GetSqlReturnCodeString(ret));

    if (!SQL_SUCCEEDED(ret) && ret != SQL_NO_DATA)
    {
      LogOdbcError(SQL_HANDLE_STMT, StatementHandle, "SQLFetch failed");
    }

    return ret;
  }

  SQLRETURN RealOdbcApi::SQLGetData(SQLHSTMT StatementHandle, SQLUSMALLINT ColumnNumber, SQLSMALLINT TargetType,
                                    SQLPOINTER TargetValue, SQLLEN BufferLength, SQLLEN *StrLen_or_Ind)
  {
    SQL_LOG_TRACE_STREAM("SQLGetData called - Handle: " << StatementHandle
                                                        << ", ColumnNumber: " << ColumnNumber
                                                        << ", TargetType: " << TargetType
                                                        << ", BufferLength: " << BufferLength);

    SQLRETURN ret = ::SQLGetData(StatementHandle, ColumnNumber, TargetType, TargetValue, BufferLength, StrLen_or_Ind);

    // Interpret and log the result
    if (SQL_SUCCEEDED(ret))
    {
      std::string valueStr = "unknown";

      // If we have a null indicator, check if data is null
      if (StrLen_or_Ind && *StrLen_or_Ind == SQL_NULL_DATA)
      {
        valueStr = "NULL";
      }
      // Otherwise try to interpret data based on target type
      else if (TargetValue)
      {
        switch (TargetType)
        {
        case SQL_C_CHAR:
          if (BufferLength > 0)
          {
            valueStr = "'" + std::string(static_cast<char *>(TargetValue)) + "'";
          }
          break;
        case SQL_C_WCHAR:
          if (BufferLength > 0)
          {
            valueStr = "'" + WideToUtf8(static_cast<SQLWCHAR *>(TargetValue)) + "'";
          }
          break;
        case SQL_C_SLONG:
        case SQL_C_LONG:
          valueStr = std::to_string(*static_cast<SQLINTEGER *>(TargetValue));
          break;
        case SQL_C_DOUBLE:
          valueStr = std::to_string(*static_cast<SQLDOUBLE *>(TargetValue));
          break;
          // Add more types as needed
        }
      }

      SQL_LOG_TRACE_STREAM("SQLGetData returned: " << GetSqlReturnCodeString(ret)
                                                   << ", Value: " << valueStr
                                                   << ", StrLen_or_Ind: " << (StrLen_or_Ind ? std::to_string(*StrLen_or_Ind) : "null"));
    }
    else
    {
      SQL_LOG_TRACE_STREAM("SQLGetData returned: " << GetSqlReturnCodeString(ret));

      if (ret != SQL_NO_DATA)
      {
        LogOdbcError(SQL_HANDLE_STMT, StatementHandle, "SQLGetData failed");
      }
    }

    return ret;
  }

  SQLRETURN RealOdbcApi::SQLBindParameter(
      SQLHSTMT hstmt,
      SQLUSMALLINT ipar,
      SQLSMALLINT fParamType,
      SQLSMALLINT fCType,
      SQLSMALLINT fSqlType,
      SQLULEN cbColDef,
      SQLSMALLINT ibScale,
      SQLPOINTER rgbValue,
      SQLLEN cbValueMax,
      SQLLEN *pcbValue)
  {
    // Convert parameter type to readable string
    std::string paramTypeStr;
    switch (fParamType)
    {
    case SQL_PARAM_INPUT:
      paramTypeStr = "SQL_PARAM_INPUT";
      break;
    case SQL_PARAM_OUTPUT:
      paramTypeStr = "SQL_PARAM_OUTPUT";
      break;
    case SQL_PARAM_INPUT_OUTPUT:
      paramTypeStr = "SQL_PARAM_INPUT_OUTPUT";
      break;
    default:
      paramTypeStr = "UNKNOWN(" + std::to_string(fParamType) + ")";
    }

    // Convert C type to readable string (similar conversions as above)
    std::string cTypeStr = std::to_string(fCType);
    std::string sqlTypeStr = std::to_string(fSqlType);

    SQL_LOG_TRACE_STREAM("SQLBindParameter called - Handle: " << hstmt
                                                              << ", Parameter: " << ipar
                                                              << ", ParamType: " << paramTypeStr
                                                              << ", CType: " << cTypeStr
                                                              << ", SqlType: " << sqlTypeStr
                                                              << ", ColumnDef: " << cbColDef
                                                              << ", Scale: " << ibScale
                                                              << ", ValueMax: " << cbValueMax);

    // For input parameters, try to log the actual value being bound
    if ((fParamType == SQL_PARAM_INPUT || fParamType == SQL_PARAM_INPUT_OUTPUT) && rgbValue)
    {
      std::string valueStr = "unknown";
      bool isNull = pcbValue && *pcbValue == SQL_NULL_DATA;

      if (!isNull)
      {
        switch (fCType)
        {
        case SQL_C_CHAR:
          valueStr = "'" + std::string(static_cast<char *>(rgbValue)) + "'";
          break;
        case SQL_C_WCHAR:
          valueStr = "'" + WideToUtf8(static_cast<SQLWCHAR *>(rgbValue)) + "'";
          break;
        case SQL_C_SLONG:
        case SQL_C_LONG:
          valueStr = std::to_string(*static_cast<SQLINTEGER *>(rgbValue));
          break;
        case SQL_C_DOUBLE:
          valueStr = std::to_string(*static_cast<SQLDOUBLE *>(rgbValue));
          break;
          // Add more types as needed
        }
      }
      else
      {
        valueStr = "NULL";
      }

      SQL_LOG_TRACE_STREAM("Parameter " << ipar << " value: " << valueStr);
    }

    SQLRETURN ret = ::SQLBindParameter(hstmt, ipar, fParamType, fCType, fSqlType,
                                       cbColDef, ibScale, rgbValue, cbValueMax, pcbValue);

    SQL_LOG_TRACE_STREAM("SQLBindParameter returned: " << GetSqlReturnCodeString(ret));

    if (!SQL_SUCCEEDED(ret))
    {
      LogOdbcError(SQL_HANDLE_STMT, hstmt, "SQLBindParameter failed");
    }

    return ret;
  }

} // namespace mssql