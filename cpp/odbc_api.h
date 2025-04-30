#pragma once

#include <platform.h>
#include <odbc_common.h>
#include <memory>
#include <vector>
#include <string>

namespace mssql {

class OdbcError;

class IOdbcApi {
  public:
      virtual ~IOdbcApi() = default;
  
      // Environment functions
      virtual SQLRETURN SQLSetEnvAttr(
          SQLHENV environmentHandle,
          SQLINTEGER attribute,
          SQLPOINTER value,
          SQLINTEGER stringLength) = 0;
  
      virtual SQLRETURN SQLAllocHandle(
          SQLSMALLINT handleType,
          SQLHANDLE inputHandle,
          SQLHANDLE* outputHandle) = 0;
  
      // Add other ODBC functions you need...
  };


  /**
 * Real implementation of the ODBC API interface
 * This class passes calls directly to the actual ODBC API
 */
class RealOdbcApi : public IOdbcApi {
  public:
      SQLRETURN SQLSetEnvAttr(
          SQLHENV environmentHandle,
          SQLINTEGER attribute,
          SQLPOINTER value,
          SQLINTEGER stringLength) override {
          return ::SQLSetEnvAttr(environmentHandle, attribute, value, stringLength);
      }
  
      SQLRETURN SQLAllocHandle(
          SQLSMALLINT handleType,
          SQLHANDLE inputHandle,
          SQLHANDLE* outputHandle) override {
          return ::SQLAllocHandle(handleType, inputHandle, outputHandle);
      }
  
      // Implement other ODBC functions...
  };
  
} // namespace mssql