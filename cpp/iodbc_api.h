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
  };

  // Concrete implementation that forwards to actual ODBC
  class RealOdbcApi : public IOdbcApi
  {
  public:
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
        SQLWCHAR *InConnectionString,
        SQLSMALLINT StringLength1,
        SQLWCHAR *OutConnectionString,
        SQLSMALLINT BufferLength,
        SQLSMALLINT *StringLength2Ptr,
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
  };

}