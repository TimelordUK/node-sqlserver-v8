#include <platform.h>
#include <common/odbc_common.h>
#include <odbc/odbc_type_mapper.h>

namespace mssql {

/*
Recommendation

  For your use case, I'd recommend the unordered_map approach because:

  1. It's simple to implement and maintain
  2. Provides O(1) average case performance
  3. The map is initialized once (static)
  4. Easy to add new types
  5. The memory overhead is negligible for ~150 entries

  Here's the optimized version:

  SQLSMALLINT OdbcTypeMapper::parseOdbcTypeString(const std::string& typeStr) {
    if (typeStr.empty()) {
      return SQL_UNKNOWN_TYPE;
    }

    // Initialize once, reuse for all calls
    static const std::unordered_map<std::string, SQLSMALLINT> typeMap = []() {
      std::unordered_map<std::string, SQLSMALLINT> map;
      map.reserve(150); // Prevent rehashing

      // C Types
      map["SQL_C_CHAR"] = SQL_C_CHAR;
      map["SQL_C_WCHAR"] = SQL_C_WCHAR;
      // ... add all mappings

      return map;
    }();

    std::string upperTypeStr;
    upperTypeStr.reserve(typeStr.length());
    std::transform(typeStr.begin(), typeStr.end(),
                   std::back_inserter(upperTypeStr), ::toupper);

    auto it = typeMap.find(upperTypeStr);
    return (it != typeMap.end()) ? it->second : SQL_UNKNOWN_TYPE;
  }

  This should be significantly faster than the sequential if-statements, especially as the number of
types grows.
*/
std::string OdbcTypeMapper::MapSqlTypeToJsType(const SQLSMALLINT datatype) {
  string type_name;

  switch (datatype) {
    case SQL_CHAR:
    case SQL_VARCHAR:
    case SQL_LONGVARCHAR:
    case SQL_WCHAR:
    case SQL_WVARCHAR:
    case SQL_WLONGVARCHAR:
    case SQL_GUID:
    case SQL_SS_XML:
      type_name = "text";
      break;
    case SQL_BIT:
      type_name = "boolean";
      break;
    case SQL_SMALLINT:
    case SQL_TINYINT:
    case SQL_INTEGER:
    case SQL_DECIMAL:
    case SQL_NUMERIC:
    case SQL_REAL:
    case SQL_FLOAT:
    case SQL_DOUBLE:
    case SQL_BIGINT:
      type_name = "number";
      break;
    case SQL_TYPE_TIME:
    case SQL_SS_TIME2:
    case SQL_TYPE_TIMESTAMP:
    case SQL_TYPE_DATE:
    case SQL_SS_TIMESTAMPOFFSET:
      type_name = "date";
      break;
    case SQL_BINARY:
    case SQL_VARBINARY:
    case SQL_LONGVARBINARY:
    case SQL_SS_UDT:
      type_name = "binary";
      break;
    default:
      type_name = "text";
      break;
  }
  return type_name;
}

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

  // Initialize once, reuse for all calls
  static const std::unordered_map<std::string, SQLSMALLINT> typeMap = []() {
    std::unordered_map<std::string, SQLSMALLINT> map;
    map.reserve(150);  // Prevent rehashing

    // C Types
    map["SQL_C_CHAR"] = SQL_C_CHAR;
    map["SQL_C_WCHAR"] = SQL_C_WCHAR;
    map["SQL_C_BIT"] = SQL_C_BIT;
    map["SQL_C_TINYINT"] = SQL_C_TINYINT;
    map["SQL_C_STINYINT"] = SQL_C_STINYINT;
    map["SQL_C_UTINYINT"] = SQL_C_UTINYINT;
    map["SQL_C_SHORT"] = SQL_C_SHORT;
    map["SQL_C_SSHORT"] = SQL_C_SSHORT;
    map["SQL_C_USHORT"] = SQL_C_USHORT;
    map["SQL_C_LONG"] = SQL_C_LONG;
    map["SQL_C_SLONG"] = SQL_C_SLONG;
    map["SQL_C_ULONG"] = SQL_C_ULONG;
    map["SQL_C_FLOAT"] = SQL_C_FLOAT;
    map["SQL_C_DOUBLE"] = SQL_C_DOUBLE;
    map["SQL_C_NUMERIC"] = SQL_C_NUMERIC;
    map["SQL_C_DATE"] = SQL_C_DATE;
    map["SQL_C_TIME"] = SQL_C_TIME;
    map["SQL_C_TIMESTAMP"] = SQL_C_TIMESTAMP;
    map["SQL_C_TYPE_DATE"] = SQL_C_TYPE_DATE;
    map["SQL_C_TYPE_TIME"] = SQL_C_TYPE_TIME;
    map["SQL_C_TYPE_TIMESTAMP"] = SQL_C_TYPE_TIMESTAMP;
    map["SQL_C_BINARY"] = SQL_C_BINARY;
    map["SQL_C_BOOKMARK"] = SQL_C_BOOKMARK;
    map["SQL_C_VARBOOKMARK"] = SQL_C_VARBOOKMARK;
    map["SQL_C_DEFAULT"] = SQL_C_DEFAULT;
    map["SQL_C_SBIGINT"] = SQL_C_SBIGINT;
    map["SQL_C_UBIGINT"] = SQL_C_UBIGINT;
    map["SQL_C_GUID"] = SQL_C_GUID;
    map["SQL_C_INTERVAL_YEAR"] = SQL_C_INTERVAL_YEAR;
    map["SQL_C_INTERVAL_MONTH"] = SQL_C_INTERVAL_MONTH;
    map["SQL_C_INTERVAL_DAY"] = SQL_C_INTERVAL_DAY;
    map["SQL_C_INTERVAL_HOUR"] = SQL_C_INTERVAL_HOUR;
    map["SQL_C_INTERVAL_MINUTE"] = SQL_C_INTERVAL_MINUTE;
    map["SQL_C_INTERVAL_SECOND"] = SQL_C_INTERVAL_SECOND;
    map["SQL_C_INTERVAL_YEAR_TO_MONTH"] = SQL_C_INTERVAL_YEAR_TO_MONTH;
    map["SQL_C_INTERVAL_DAY_TO_HOUR"] = SQL_C_INTERVAL_DAY_TO_HOUR;
    map["SQL_C_INTERVAL_DAY_TO_MINUTE"] = SQL_C_INTERVAL_DAY_TO_MINUTE;
    map["SQL_C_INTERVAL_DAY_TO_SECOND"] = SQL_C_INTERVAL_DAY_TO_SECOND;

    map["SQL_CHAR"] = SQL_CHAR;
    map["SQL_VARCHAR"] = SQL_VARCHAR;
    map["SQL_LONGVARCHAR"] = SQL_LONGVARCHAR;
    map["SQL_WCHAR"] = SQL_WCHAR;
    map["SQL_WVARCHAR"] = SQL_WVARCHAR;
    map["SQL_WLONGVARCHAR"] = SQL_WLONGVARCHAR;
    map["SQL_DECIMAL"] = SQL_DECIMAL;
    map["SQL_NUMERIC"] = SQL_NUMERIC;
    map["SQL_SMALLINT"] = SQL_SMALLINT;
    map["SQL_INTEGER"] = SQL_INTEGER;
    map["SQL_REAL"] = SQL_REAL;
    map["SQL_FLOAT"] = SQL_FLOAT;
    map["SQL_DOUBLE"] = SQL_DOUBLE;
    map["SQL_BIT"] = SQL_BIT;
    map["SQL_TINYINT"] = SQL_TINYINT;
    map["SQL_BIGINT"] = SQL_BIGINT;
    map["SQL_BINARY"] = SQL_BINARY;
    map["SQL_VARBINARY"] = SQL_VARBINARY;
    map["SQL_LONGVARBINARY"] = SQL_LONGVARBINARY;
    map["SQL_TYPE_DATE"] = SQL_TYPE_DATE;
    map["SQL_TYPE_TIME"] = SQL_TYPE_TIME;
    map["SQL_TYPE_TIMESTAMP"] = SQL_TYPE_TIMESTAMP;
    map["SQL_GUID"] = SQL_GUID;
    map["SQL_DATE"] = SQL_DATE;
    map["SQL_TIME"] = SQL_TIME;
    map["SQL_TIMESTAMP"] = SQL_TIMESTAMP;
    map["SQL_INTERVAL_YEAR"] = SQL_INTERVAL_YEAR;
    map["SQL_INTERVAL_MONTH"] = SQL_INTERVAL_MONTH;

    map["CHAR"] = SQL_CHAR;
    map["VARCHAR"] = SQL_VARCHAR;
    map["TEXT"] = SQL_LONGVARCHAR;
    map["NCHAR"] = SQL_WCHAR;
    map["NVARCHAR"] = SQL_WVARCHAR;
    map["NTEXT"] = SQL_WLONGVARCHAR;
    map["DECIMAL"] = SQL_DECIMAL;
    map["NUMERIC"] = SQL_NUMERIC;
    map["SMALLINT"] = SQL_SMALLINT;
    map["INTEGER"] = SQL_INTEGER;
    map["REAL"] = SQL_REAL;
    map["FLOAT"] = SQL_FLOAT;
    map["DOUBLE"] = SQL_DOUBLE;
    map["BIT"] = SQL_BIT;
    map["TINYINT"] = SQL_TINYINT;
    map["BIGINT"] = SQL_BIGINT;
    map["BINARY"] = SQL_BINARY;
    map["VARBINARY"] = SQL_VARBINARY;
    map["DATE"] = SQL_TYPE_DATE;
    map["TIME"] = SQL_TYPE_TIME;
    map["TIMESTAMP"] = SQL_TYPE_TIMESTAMP;
    map["DATETIME"] = SQL_TYPE_TIMESTAMP;
    map["DATETIME2"] = SQL_TYPE_TIMESTAMP;
    map["BOOLEAN"] = SQL_BIT;
    map["INT"] = SQL_INTEGER;
    map["STRING"] = SQL_VARCHAR;

    map["JS_UNKNOWN"] = 0;
    map["JS_NULL"] = 1;
    map["JS_STRING"] = 2;
    map["JS_BOOLEAN"] = 3;
    map["JS_INT"] = 4;
    map["JS_UINT"] = 5;
    map["JS_NUMBER"] = 6;

    return map;
  }();

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
