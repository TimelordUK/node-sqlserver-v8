// In your test header
#pragma once
#include "platform.h"

namespace mssql
{
  namespace test
  {

    // Define function pointer types for ODBC functions
    using SQLAllocHandleFunc = SQLRETURN (*)(SQLSMALLINT, SQLHANDLE, SQLHANDLE *);
    using SQLFreeHandleFunc = SQLRETURN (*)(SQLSMALLINT, SQLHANDLE);
    using SQLSetEnvAttrFunc = SQLRETURN (*)(SQLHANDLE, SQLINTEGER, SQLPOINTER, SQLINTEGER);
    using SQLSetConnectAttrFunc = SQLRETURN (*)(SQLHANDLE, SQLINTEGER, SQLPOINTER, SQLINTEGER);
    using SQLDriverConnectFunc = SQLRETURN (*)(SQLHANDLE, SQLHWND, SQLWCHAR *, SQLSMALLINT,
                                               SQLWCHAR *, SQLSMALLINT, SQLSMALLINT *, SQLUSMALLINT);
    // Add more as needed

    // Define storage for function pointers
    extern SQLAllocHandleFunc g_SQLAllocHandle;
    extern SQLFreeHandleFunc g_SQLFreeHandle;
    extern SQLSetEnvAttrFunc g_SQLSetEnvAttr;
    extern SQLSetConnectAttrFunc g_SQLSetConnectAttr;
    extern SQLDriverConnectFunc g_SQLDriverConnect;
    // Add more as needed

    // Initialization function
    void InitializeOdbcMocks();

    // Utility class to restore original functions
    class OdbcMockScope
    {
    public:
      OdbcMockScope()
      {
        // Save original function pointers
        original_SQLAllocHandle = g_SQLAllocHandle;
        original_SQLFreeHandle = g_SQLFreeHandle;
        // More saves...
      }

      ~OdbcMockScope()
      {
        // Restore original function pointers
        g_SQLAllocHandle = original_SQLAllocHandle;
        g_SQLFreeHandle = original_SQLFreeHandle;
        // More restores...
      }

    private:
      SQLAllocHandleFunc original_SQLAllocHandle;
      SQLFreeHandleFunc original_SQLFreeHandle;
      // More originals...
    };

  } // namespace test
} // namespace mssql

// In odbc_handle.h or a new header (for production code)
// Define macros to use function pointers
#ifdef MSSQL_TESTING
#define SQLAllocHandle mssql::test::g_SQLAllocHandle
#define SQLFreeHandle mssql::test::g_SQLFreeHandle
#define SQLSetEnvAttr mssql::test::g_SQLSetEnvAttr
#define SQLSetConnectAttr mssql::test::g_SQLSetConnectAttr
#define SQLDriverConnect mssql::test::g_SQLDriverConnect
// Add more as needed
#endif