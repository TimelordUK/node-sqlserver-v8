#pragma once

#include "iodbc_api.h"
#include <gmock/gmock.h>

namespace mssql
{

  class MockOdbcApi : public IOdbcApi
  {
  public:
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
  };

}