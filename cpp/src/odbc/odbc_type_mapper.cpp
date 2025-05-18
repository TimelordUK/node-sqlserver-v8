#include <platform.h>
#include <common/odbc_common.h>
#include <odbc/odbc_type_mapper.h>

namespace mssql {

SQLSMALLINT OdbcTypeMapper::parseOdbcParamTypeString(const std::string& typeStr) {
  if (typeStr.empty()) {
    return SQL_UNKNOWN_TYPE;
  }
  std::string upperTypeStr = typeStr;
  std::transform(upperTypeStr.begin(), upperTypeStr.end(), upperTypeStr.begin(), ::toupper);

  if (upperTypeStr == "SQL_PARAM_INPUT")
    return SQL_PARAM_INPUT;
  if (upperTypeStr == "SQL_PARAM_OUTPUT")
    return SQL_PARAM_OUTPUT;
  if (upperTypeStr == "SQL_PARAM_INPUT_OUTPUT")
    return SQL_PARAM_INPUT_OUTPUT;
  if (upperTypeStr == "SQL_RETURN_VALUE")
    return SQL_RETURN_VALUE;
  if (upperTypeStr == "SQL_RESULT_COL")
    return SQL_RESULT_COL;
  if (upperTypeStr == "SQL_PARAM_TYPE_UNKNOWN")
    return SQL_PARAM_TYPE_UNKNOWN;
  return SQL_PARAM_INPUT;
}

/**
 * @brief Parses SQL type strings from TypeScript to ODBC numeric constants
 *
 * This function converts string representations of SQL types and C types
 * from the TypeScript SqlParameter object into their numeric ODBC counterparts.
 *
 * @param typeStr The type string to parse (e.g., "SQL_BIT", "SQL_C_CHAR")
 * @return SQLSMALLINT The corresponding ODBC numeric constant
 */
SQLSMALLINT OdbcTypeMapper::parseOdbcTypeString(const std::string& typeStr) {
  // Handle empty strings
  if (typeStr.empty()) {
    return SQL_UNKNOWN_TYPE;
  }

  std::string upperTypeStr = typeStr;
  std::transform(upperTypeStr.begin(), upperTypeStr.end(), upperTypeStr.begin(), ::toupper);

  // C Types (SQL_C_*)
  if (upperTypeStr == "SQL_C_CHAR")
    return SQL_C_CHAR;
  if (upperTypeStr == "SQL_C_WCHAR")
    return SQL_C_WCHAR;
  if (upperTypeStr == "SQL_C_BIT")
    return SQL_C_BIT;
  if (upperTypeStr == "SQL_C_TINYINT")
    return SQL_C_TINYINT;
  if (upperTypeStr == "SQL_C_STINYINT")
    return SQL_C_STINYINT;
  if (upperTypeStr == "SQL_C_UTINYINT")
    return SQL_C_UTINYINT;
  if (upperTypeStr == "SQL_C_SHORT")
    return SQL_C_SHORT;
  if (upperTypeStr == "SQL_C_SSHORT")
    return SQL_C_SSHORT;
  if (upperTypeStr == "SQL_C_USHORT")
    return SQL_C_USHORT;
  if (upperTypeStr == "SQL_C_LONG")
    return SQL_C_LONG;
  if (upperTypeStr == "SQL_C_SLONG")
    return SQL_C_SLONG;
  if (upperTypeStr == "SQL_C_ULONG")
    return SQL_C_ULONG;
  if (upperTypeStr == "SQL_C_FLOAT")
    return SQL_C_FLOAT;
  if (upperTypeStr == "SQL_C_DOUBLE")
    return SQL_C_DOUBLE;
  if (upperTypeStr == "SQL_C_NUMERIC")
    return SQL_C_NUMERIC;
  if (upperTypeStr == "SQL_C_DATE")
    return SQL_C_DATE;
  if (upperTypeStr == "SQL_C_TIME")
    return SQL_C_TIME;
  if (upperTypeStr == "SQL_C_TIMESTAMP")
    return SQL_C_TIMESTAMP;
  if (upperTypeStr == "SQL_C_TYPE_DATE")
    return SQL_C_TYPE_DATE;
  if (upperTypeStr == "SQL_C_TYPE_TIME")
    return SQL_C_TYPE_TIME;
  if (upperTypeStr == "SQL_C_TYPE_TIMESTAMP")
    return SQL_C_TYPE_TIMESTAMP;
  if (upperTypeStr == "SQL_C_BINARY")
    return SQL_C_BINARY;
  if (upperTypeStr == "SQL_C_BOOKMARK")
    return SQL_C_BOOKMARK;
  if (upperTypeStr == "SQL_C_VARBOOKMARK")
    return SQL_C_VARBOOKMARK;
  if (upperTypeStr == "SQL_C_DEFAULT")
    return SQL_C_DEFAULT;

  // ODBC 3.0 C types
  if (upperTypeStr == "SQL_C_SBIGINT")
    return SQL_C_SBIGINT;
  if (upperTypeStr == "SQL_C_UBIGINT")
    return SQL_C_UBIGINT;
  if (upperTypeStr == "SQL_C_GUID")
    return SQL_C_GUID;

  // Interval C types
  if (upperTypeStr == "SQL_C_INTERVAL_YEAR")
    return SQL_C_INTERVAL_YEAR;
  if (upperTypeStr == "SQL_C_INTERVAL_MONTH")
    return SQL_C_INTERVAL_MONTH;
  if (upperTypeStr == "SQL_C_INTERVAL_DAY")
    return SQL_C_INTERVAL_DAY;
  if (upperTypeStr == "SQL_C_INTERVAL_HOUR")
    return SQL_C_INTERVAL_HOUR;
  if (upperTypeStr == "SQL_C_INTERVAL_MINUTE")
    return SQL_C_INTERVAL_MINUTE;
  if (upperTypeStr == "SQL_C_INTERVAL_SECOND")
    return SQL_C_INTERVAL_SECOND;
  if (upperTypeStr == "SQL_C_INTERVAL_YEAR_TO_MONTH")
    return SQL_C_INTERVAL_YEAR_TO_MONTH;
  if (upperTypeStr == "SQL_C_INTERVAL_DAY_TO_HOUR")
    return SQL_C_INTERVAL_DAY_TO_HOUR;
  if (upperTypeStr == "SQL_C_INTERVAL_DAY_TO_MINUTE")
    return SQL_C_INTERVAL_DAY_TO_MINUTE;
  if (upperTypeStr == "SQL_C_INTERVAL_DAY_TO_SECOND")
    return SQL_C_INTERVAL_DAY_TO_SECOND;
  if (upperTypeStr == "SQL_C_INTERVAL_HOUR_TO_MINUTE")
    return SQL_C_INTERVAL_HOUR_TO_MINUTE;
  if (upperTypeStr == "SQL_C_INTERVAL_HOUR_TO_SECOND")
    return SQL_C_INTERVAL_HOUR_TO_SECOND;
  if (upperTypeStr == "SQL_C_INTERVAL_MINUTE_TO_SECOND")
    return SQL_C_INTERVAL_MINUTE_TO_SECOND;

  // SQL Types
  if (upperTypeStr == "SQL_CHAR")
    return SQL_CHAR;
  if (upperTypeStr == "SQL_VARCHAR")
    return SQL_VARCHAR;
  if (upperTypeStr == "SQL_LONGVARCHAR")
    return SQL_LONGVARCHAR;
  if (upperTypeStr == "SQL_WCHAR")
    return SQL_WCHAR;
  if (upperTypeStr == "SQL_WVARCHAR")
    return SQL_WVARCHAR;
  if (upperTypeStr == "SQL_WLONGVARCHAR")
    return SQL_WLONGVARCHAR;
  if (upperTypeStr == "SQL_DECIMAL")
    return SQL_DECIMAL;
  if (upperTypeStr == "SQL_NUMERIC")
    return SQL_NUMERIC;
  if (upperTypeStr == "SQL_SMALLINT")
    return SQL_SMALLINT;
  if (upperTypeStr == "SQL_INTEGER")
    return SQL_INTEGER;
  if (upperTypeStr == "SQL_REAL")
    return SQL_REAL;
  if (upperTypeStr == "SQL_FLOAT")
    return SQL_FLOAT;
  if (upperTypeStr == "SQL_DOUBLE")
    return SQL_DOUBLE;
  if (upperTypeStr == "SQL_BIT")
    return SQL_BIT;
  if (upperTypeStr == "SQL_TINYINT")
    return SQL_TINYINT;
  if (upperTypeStr == "SQL_BIGINT")
    return SQL_BIGINT;
  if (upperTypeStr == "SQL_BINARY")
    return SQL_BINARY;
  if (upperTypeStr == "SQL_VARBINARY")
    return SQL_VARBINARY;
  if (upperTypeStr == "SQL_LONGVARBINARY")
    return SQL_LONGVARBINARY;
  if (upperTypeStr == "SQL_TYPE_DATE")
    return SQL_TYPE_DATE;
  if (upperTypeStr == "SQL_TYPE_TIME")
    return SQL_TYPE_TIME;
  if (upperTypeStr == "SQL_TYPE_TIMESTAMP")
    return SQL_TYPE_TIMESTAMP;
  if (upperTypeStr == "SQL_GUID")
    return SQL_GUID;

  // Date/Time Types
  if (upperTypeStr == "SQL_DATE")
    return SQL_DATE;
  if (upperTypeStr == "SQL_TIME")
    return SQL_TIME;
  if (upperTypeStr == "SQL_TIMESTAMP")
    return SQL_TIMESTAMP;

  // Interval Types
  if (upperTypeStr == "SQL_INTERVAL_YEAR")
    return SQL_INTERVAL_YEAR;
  if (upperTypeStr == "SQL_INTERVAL_MONTH")
    return SQL_INTERVAL_MONTH;
  if (upperTypeStr == "SQL_INTERVAL_DAY")
    return SQL_INTERVAL_DAY;
  if (upperTypeStr == "SQL_INTERVAL_HOUR")
    return SQL_INTERVAL_HOUR;
  if (upperTypeStr == "SQL_INTERVAL_MINUTE")
    return SQL_INTERVAL_MINUTE;
  if (upperTypeStr == "SQL_INTERVAL_SECOND")
    return SQL_INTERVAL_SECOND;
  if (upperTypeStr == "SQL_INTERVAL_YEAR_TO_MONTH")
    return SQL_INTERVAL_YEAR_TO_MONTH;
  if (upperTypeStr == "SQL_INTERVAL_DAY_TO_HOUR")
    return SQL_INTERVAL_DAY_TO_HOUR;
  if (upperTypeStr == "SQL_INTERVAL_DAY_TO_MINUTE")
    return SQL_INTERVAL_DAY_TO_MINUTE;
  if (upperTypeStr == "SQL_INTERVAL_DAY_TO_SECOND")
    return SQL_INTERVAL_DAY_TO_SECOND;
  if (upperTypeStr == "SQL_INTERVAL_HOUR_TO_MINUTE")
    return SQL_INTERVAL_HOUR_TO_MINUTE;
  if (upperTypeStr == "SQL_INTERVAL_HOUR_TO_SECOND")
    return SQL_INTERVAL_HOUR_TO_SECOND;
  if (upperTypeStr == "SQL_INTERVAL_MINUTE_TO_SECOND")
    return SQL_INTERVAL_MINUTE_TO_SECOND;

  // Special values
  if (upperTypeStr == "SQL_DEFAULT")
    return SQL_DEFAULT;
  if (upperTypeStr == "SQL_ARD_TYPE")
    return SQL_ARD_TYPE;

  // Also parse JS_TYPE enum values from TypeScript
  if (upperTypeStr == "JS_UNKNOWN")
    return 0;  // JS_UNKNOWN
  if (upperTypeStr == "JS_NULL")
    return 1;  // JS_NULL
  if (upperTypeStr == "JS_STRING")
    return 2;  // JS_STRING
  if (upperTypeStr == "JS_BOOLEAN")
    return 3;  // JS_BOOLEAN
  if (upperTypeStr == "JS_INT")
    return 4;  // JS_INT
  if (upperTypeStr == "JS_UINT")
    return 5;  // JS_UINT
  if (upperTypeStr == "JS_NUMBER")
    return 6;  // JS_NUMBER
  if (upperTypeStr == "JS_DATE")
    return 7;  // JS_DATE
  if (upperTypeStr == "JS_BUFFER")
    return 8;  // JS_BUFFER

  // Non-prefixed types from TypeScript
  if (upperTypeStr == "CHAR")
    return SQL_CHAR;
  if (upperTypeStr == "VARCHAR")
    return SQL_VARCHAR;
  if (upperTypeStr == "TEXT")
    return SQL_LONGVARCHAR;
  if (upperTypeStr == "NCHAR")
    return SQL_WCHAR;
  if (upperTypeStr == "NVARCHAR")
    return SQL_WVARCHAR;
  if (upperTypeStr == "NTEXT")
    return SQL_WLONGVARCHAR;
  if (upperTypeStr == "DECIMAL")
    return SQL_DECIMAL;
  if (upperTypeStr == "NUMERIC")
    return SQL_NUMERIC;
  if (upperTypeStr == "SMALLINT")
    return SQL_SMALLINT;
  if (upperTypeStr == "INTEGER")
    return SQL_INTEGER;
  if (upperTypeStr == "REAL")
    return SQL_REAL;
  if (upperTypeStr == "FLOAT")
    return SQL_FLOAT;
  if (upperTypeStr == "DOUBLE")
    return SQL_DOUBLE;
  if (upperTypeStr == "BIT")
    return SQL_BIT;
  if (upperTypeStr == "TINYINT")
    return SQL_TINYINT;
  if (upperTypeStr == "BIGINT")
    return SQL_BIGINT;
  if (upperTypeStr == "BINARY")
    return SQL_BINARY;
  if (upperTypeStr == "VARBINARY")
    return SQL_VARBINARY;
  if (upperTypeStr == "DATE")
    return SQL_TYPE_DATE;
  if (upperTypeStr == "TIME")
    return SQL_TYPE_TIME;
  if (upperTypeStr == "TIMESTAMP")
    return SQL_TYPE_TIMESTAMP;
  if (upperTypeStr == "DATETIME")
    return SQL_TYPE_TIMESTAMP;
  if (upperTypeStr == "DATETIME2")
    return SQL_TYPE_TIMESTAMP;
  if (upperTypeStr == "BOOLEAN")
    return SQL_BIT;
  if (upperTypeStr == "INT")
    return SQL_INTEGER;
  if (upperTypeStr == "STRING")
    return SQL_VARCHAR;

  // Unknown type
  return SQL_UNKNOWN_TYPE;
}

/**
 * @brief Maps a JS_TYPE enum value to an appropriate ODBC C data type
 *
 * @param jsType JS_TYPE enum value from the TypeScript side
 * @return SQLSMALLINT The corresponding ODBC C type
 */
SQLSMALLINT OdbcTypeMapper::getOdbcCTypeFromJsType(int jsType) {
  switch (jsType) {
    case 0:  // JS_UNKNOWN
      return SQL_C_DEFAULT;
    case 1:  // JS_NULL
      return SQL_C_DEFAULT;
    case 2:  // JS_STRING
      return SQL_C_CHAR;
    case 3:  // JS_BOOLEAN
      return SQL_C_BIT;
    case 4:  // JS_INT
      return SQL_C_LONG;
    case 5:  // JS_UINT
      return SQL_C_ULONG;
    case 6:  // JS_NUMBER
      return SQL_C_DOUBLE;
    case 7:  // JS_DATE
      return SQL_C_TYPE_TIMESTAMP;
    case 8:  // JS_BUFFER
      return SQL_C_BINARY;
    default:
      return SQL_C_DEFAULT;
  }
}

/**
 * @brief Maps a JS_TYPE enum value to an appropriate ODBC SQL data type
 *
 * @param jsType JS_TYPE enum value from the TypeScript side
 * @return SQLSMALLINT The corresponding ODBC SQL type
 */
SQLSMALLINT OdbcTypeMapper::getOdbcSqlTypeFromJsType(int jsType) {
  switch (jsType) {
    case 0:  // JS_UNKNOWN
      return SQL_UNKNOWN_TYPE;
    case 1:  // JS_NULL
      return SQL_VARCHAR;
    case 2:  // JS_STRING
      return SQL_VARCHAR;
    case 3:  // JS_BOOLEAN
      return SQL_BIT;
    case 4:  // JS_INT
      return SQL_INTEGER;
    case 5:  // JS_UINT
      return SQL_INTEGER;
    case 6:  // JS_NUMBER
      return SQL_DOUBLE;
    case 7:  // JS_DATE
      return SQL_TYPE_TIMESTAMP;
    case 8:  // JS_BUFFER
      return SQL_VARBINARY;
    default:
      return SQL_UNKNOWN_TYPE;
  }
}

}  // namespace mssql
