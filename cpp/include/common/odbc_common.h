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

  /**
   * Convert a driver-supplied SQLWCHAR buffer to UTF-8.
   *
   * `l` counts SQLWCHAR units, not bytes, and may exceed the buffer: `trim` derives it
   * from `capacity()`, and `SQLGetDiagRecW` reports the length *available* rather than
   * the length written. It is clamped to `size()` here so neither can read off the end.
   *
   * `SQLWCHAR` is UTF-16 where it is two bytes (Windows, unixODBC's default ABI) and
   * UTF-32 where it is four (iODBC), so surrogate pairs are recombined only in the
   * two-byte case.
   *
   * Trailing NULs are dropped, because two callers pass the *buffer* size rather than a
   * string length and rely on the terminator. An **embedded** NUL is kept: a diagnostic
   * message that legitimately contains U+0000 must not lose everything after it.
   */
  static string swcvec2str(const vector<SQLWCHAR>& v, const size_t l) {
    size_t take = min(l, v.size());
    while (take > 0 && v[take - 1] == 0) {
      --take;
    }
    string out;
    out.reserve(take);
    for (size_t i = 0; i < take; ++i) {
      auto cp = static_cast<char32_t>(static_cast<uint32_t>(v[i]));
      if (sizeof(SQLWCHAR) == 2 && cp >= 0xD800 && cp <= 0xDBFF && i + 1 < take) {
        const auto low = static_cast<char32_t>(static_cast<uint32_t>(v[i + 1]));
        if (low >= 0xDC00 && low <= 0xDFFF) {
          cp = 0x10000 + ((cp - 0xD800) << 10) + (low - 0xDC00);
          ++i;
        }
      }
      // A lone surrogate or an out-of-range unit cannot be encoded. U+FFFD keeps the
      // rest of the text readable, which is the whole point of a diagnostic message.
      if ((cp >= 0xD800 && cp <= 0xDFFF) || cp > 0x10FFFF) {
        cp = 0xFFFD;
      }
      appendUtf8(out, cp);
    }
    return out;
  }

  static std::string trim(const vector<SQLWCHAR>& v, SQLSMALLINT len) {
    auto take = min(v.size(), (size_t)len);
    auto c_msg = odbcstr::swcvec2str(v, take);
    return c_msg;
  }

 private:
  static void appendUtf8(string& out, const char32_t cp) {
    if (cp < 0x80) {
      out.push_back(static_cast<char>(cp));
    } else if (cp < 0x800) {
      out.push_back(static_cast<char>(0xC0 | (cp >> 6)));
      out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    } else if (cp < 0x10000) {
      out.push_back(static_cast<char>(0xE0 | (cp >> 12)));
      out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
      out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    } else {
      out.push_back(static_cast<char>(0xF0 | (cp >> 18)));
      out.push_back(static_cast<char>(0x80 | ((cp >> 12) & 0x3F)));
      out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
      out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    }
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