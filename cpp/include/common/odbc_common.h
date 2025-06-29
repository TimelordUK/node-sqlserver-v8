#pragma once

// ODBC headers based on platform
#ifdef _WIN32
#include <windows.h>  // Must come before SQL headers on Windows
#include <sql.h>
#include <sqlext.h>
#include <sqltypes.h>
#include <sqlucode.h>
#include "sqlncli.h"  // SQL Server specific constants

#elif defined(__linux__)
// Save GTest macros if they exist
#ifdef SUCCEED
#define GTEST_SUCCEED_SAVE SUCCEED
#undef SUCCEED
#endif
#ifdef FAIL
#define GTEST_FAIL_SAVE FAIL
#undef FAIL
#endif

#include <sql.h>
#include <sqlext.h>
#include <sqltypes.h>
#include <sqlspi.h>
#include <sqlucode.h>
#include <msodbcsql.h>  // This already defines the SQL Server structs we need
#include <sqlncli-linux.h>

// Restore GTest macros if they were saved
#ifdef GTEST_SUCCEED_SAVE
#undef SUCCEED
#define SUCCEED GTEST_SUCCEED_SAVE
#undef GTEST_SUCCEED_SAVE
#endif
#ifdef GTEST_FAIL_SAVE
#undef FAIL
#define FAIL GTEST_FAIL_SAVE
#undef GTEST_FAIL_SAVE
#endif

#elif defined(__APPLE__)
#include <sql.h>
#include <sqlext.h>
#include <sqltypes.h>
#include <sqlucode.h>
#include <msodbcsql.h>  // For SQL_SS_* types

// Define DBBIT for macOS (not defined in standard ODBC headers)
#ifndef DBBIT
typedef unsigned char DBBIT;
#endif
#endif

// SQL Server specific types that might not be defined in older headers
#ifndef SQL_SS_TIME2
#define SQL_SS_TIME2 (-154)
#endif

#ifndef SQL_SS_TIMESTAMPOFFSET
#define SQL_SS_TIMESTAMPOFFSET (-155)
#endif

// Now include platform.h after all SQL types are defined
#include "platform.h"
#include "odbc_constants.h"

// Buffer size constants
constexpr size_t MSSQL_MAX_SERVERNAME_SIZE = 128;
constexpr size_t MSSQL_MAX_ERROR_SIZE = 1024;
constexpr size_t MSSQL_MAX_COLUMN_SIZE = 256;

// Common ODBC utility functions and constants
namespace mssql {

using namespace std;

// ODBC Environment helper function
inline bool CheckSQLError(SQLRETURN ret) {
  return SQL_SUCCEEDED(ret);
}

// Platform-specific SQL character handling
#ifdef PLATFORM_WINDOWS
// Helper function to convert SQL character types
inline std::wstring SQLCharToString(SQLWCHAR* sqlStr, SQLSMALLINT length) {
  return std::wstring(reinterpret_cast<wchar_t*>(sqlStr), length);
}

// Helper to create SQL character buffers
inline SQLWCHAR* CreateSQLCharBuffer(size_t size) {
  return new SQLWCHAR[size]();
}

// Helper to delete SQL character buffers
inline void DeleteSQLCharBuffer(SQLWCHAR* buffer) {
  delete[] buffer;
}
#else
// Helper function to convert SQL character types
inline std::string SQLCharToString(SQLCHAR* sqlStr, SQLSMALLINT length) {
  return std::string(reinterpret_cast<char*>(sqlStr), length);
}

// Helper to create SQL character buffers
inline SQLCHAR* CreateSQLCharBuffer(size_t size) {
  return new SQLCHAR[size]();
}

// Helper to delete SQL character buffers
inline void DeleteSQLCharBuffer(SQLCHAR* buffer) {
  delete[] buffer;
}
#endif

// Helper class for RAII-style mutex locking
class ScopedMutexLock {
 public:
  explicit ScopedMutexLock(PlatformMutex& mutex) : mutex_(mutex) {
    LockMutex(&mutex_);
  }

  ~ScopedMutexLock() {
    UnlockMutex(&mutex_);
  }

  // Prevent copying
  ScopedMutexLock(const ScopedMutexLock&) = delete;
  ScopedMutexLock& operator=(const ScopedMutexLock&) = delete;

 private:
  PlatformMutex& mutex_;
};

class odbcstr {
 public:
  // Helper function to convert wstring to vector<SQLWCHAR>

  // Helper function to convert wstring to vector<SQLWCHAR>
  static vector<SQLWCHAR> wstr2wcvec(const wstring& s) {
    vector<SQLWCHAR> ret;
    ret.reserve(s.size());
    for (auto ch : s) {
      ret.push_back(static_cast<SQLWCHAR>(ch));
    }
    return ret;
  }

  static string swcvec2str(const vector<SQLWCHAR>& v, const size_t l) {
    vector<char> c_str;
    c_str.reserve(l + 1);
    c_str.resize(l + 1);
    constexpr auto c = static_cast<int>(sizeof(SQLWCHAR));
    const auto* ptr = reinterpret_cast<const char*>(v.data());
    for (size_t i = 0, j = 0; i < l * c; i += c, j++) {
      c_str[j] = ptr[i];
    }
    if (l > 0)
      c_str.resize(l - 1);
    string s(c_str.data());
    return s;
  }

  static std::string trim(const vector<SQLWCHAR>& v, SQLSMALLINT len) {
    auto take = min(v.capacity(), (size_t)len);
    auto c_msg = odbcstr::swcvec2str(v, take);
    return c_msg;
  }
};

// SQL Server constants
constexpr int SQL_SERVER_DEFAULT_YEAR = 1900;
constexpr int SQL_SERVER_DEFAULT_MONTH = 1;  // JS months are 0 based, SQL Server months are 1 based
constexpr int SQL_SERVER_DEFAULT_DAY = 1;
constexpr int JS_DEFAULT_YEAR = 1970;

// Error handling macro
// NOLINTNEXTLINE(cppcoreguidelines-macro-usage)
#define ErrorIf(x) \
  if (x)           \
    goto Error;

// Common ODBC constants

constexpr SQLSMALLINT SQL_MAX_ERROR_MESSAGE = 1024;
constexpr SQLSMALLINT SQL_MAX_COLUMN_NAME = 256;
constexpr SQLSMALLINT SQL_MAX_SQLSERVERNAMEe = 128;

// Common ODBC type aliases
using SQLHandle = SQLHANDLE;
using SQLEnvironmentHandle = SQLHENV;
using SQLConnectionHandle = SQLHDBC;
using SQLStatementHandle = SQLHSTMT;
using SQLReturn = SQLRETURN;
using SQLChar = SQLCHAR;
using SQLWChar = SQLWCHAR;
using SQLInteger = SQLINTEGER;
using SQLSmallInt = SQLSMALLINT;
using SQLULen = SQLULEN;
using SQLLen = SQLLEN;

// Common buffer size constants
constexpr SQLSMALLINT MSSQL_MAX_SERVER_NAME = 128;
constexpr SQLSMALLINT MSSQL_MAX_ERROR_MSG = 1024;
constexpr SQLSMALLINT MSSQL_MAX_COLUMN_NAME = 256;

}  // namespace mssql