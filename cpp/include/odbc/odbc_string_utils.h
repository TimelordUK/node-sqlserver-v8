#pragma once

#include <string>

#include "odbc_common.h"
#include "platform.h"

namespace mssql {

// ODBC string utilities
class OdbcStringUtils {
 public:
#ifdef PLATFORM_WINDOWS
  // Use Unicode versions of ODBC functions on Windows
  static std::wstring SQLCharToString(SQLWCHAR* sqlStr, SQLSMALLINT length) {
    return std::wstring(reinterpret_cast<wchar_t*>(sqlStr), length);
  }

  static SQLWCHAR* CreateSQLCharBuffer(size_t size) {
    return new SQLWCHAR[size]();
  }

  static void DeleteSQLCharBuffer(SQLWCHAR* buffer) {
    delete[] buffer;
  }

#else
  // Use ANSI versions of ODBC functions on other platforms
  static std::string SQLCharToString(SQLCHAR* sqlStr, SQLSMALLINT length) {
    return std::string(reinterpret_cast<char*>(sqlStr), length);
  }

  static SQLCHAR* CreateSQLCharBuffer(size_t size) {
    return new SQLCHAR[size]();
  }

  static void DeleteSQLCharBuffer(SQLCHAR* buffer) {
    delete[] buffer;
  }
#endif

  // Common SQL Server constants
  inline static constexpr int MSSQL_DEFAULT_YEAR{1900};
  inline static constexpr int MSSQL_DEFAULT_MONTH{
      1};  // JS months are 0 based, SQL Server months are 1 based
  inline static constexpr int MSSQL_DEFAULT_DAY{1};
  inline static constexpr int MSSQL_JS_DEFAULT_YEAR{1970};
};

}  // namespace mssql