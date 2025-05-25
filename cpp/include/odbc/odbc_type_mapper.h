#pragma once

#include <Logger.h>

#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

#include "datum_storage.h"
#include "odbc_driver_types.h"

namespace mssql {

class OdbcTypeMapper {
 public:
  static std::string MapSqlTypeToJsType(const SQLSMALLINT datatype);
  static SQLSMALLINT parseOdbcParamTypeString(const std::string& typeStr);
  static SQLSMALLINT parseOdbcTypeString(const std::string& typeStr);
  static SQLSMALLINT getOdbcCTypeFromJsType(int jsType);
  static SQLSMALLINT getOdbcSqlTypeFromJsType(int jsType);
};
}  // namespace mssql
