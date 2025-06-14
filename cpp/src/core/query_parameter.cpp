// In query_parameter.cpp
#include <platform.h>
#include "core/query_parameter.h"
#include <utils/Logger.h>
#include "odbc/iodbc_api.h"

namespace mssql {
// QueryParameter implementation

QueryParameter::QueryParameter(int index, std::shared_ptr<DatumStorage> storage)
    : index_(index),
      param_type_(SQL_PARAM_INPUT),
      param_size_(0),
      decimal_digits_(0),
      c_type(0),
      sql_type(0),
      storage_(storage) {
  if (!storage_) {
    throw std::invalid_argument("DatumStorage cannot be null");
  }
}

SQLRETURN QueryParameter::bind(SQLHSTMT hstmt, std::shared_ptr<IOdbcApi> api) {
  if (!storage_) {
    SQL_LOG_ERROR("No storage available for parameter binding");
    return SQL_ERROR;
  }

  // Get the SQL type and C type from storage
  mapStorageTypeToOdbc();

  // Get the parameter size and buffer
  param_size_ = storage_->size();
  void* buffer = storage_->getBuffer();

  // Resize indicators vector if needed (for array binding)
  indicators_.resize(1);
  indicators_[0] = storage_->getIndicator();

  // Bind the parameter
  return api->SQLBindParameter(hstmt,              // Statement handle
                               index_,             // Parameter number
                               param_type_,        // Input/Output type
                               c_type,             // C data type
                               sql_type,           // SQL data type
                               param_size_,        // Column size
                               decimal_digits_,    // Decimal digits
                               buffer,             // Parameter value ptr
                               0,                  // Buffer length
                               indicators_.data()  // Str len or Ind ptr
  );
}

void QueryParameter::mapStorageTypeToOdbc() {
  DatumStorage::SqlType storageType = storage_->getType();
  
  // If the type is Unknown, try to infer from the stored data
  if (storageType == DatumStorage::SqlType::Unknown) {
    storageType = inferTypeFromStorage();
  }
  
  switch (storageType) {
    case DatumStorage::SqlType::TinyInt:
      c_type = SQL_C_TINYINT;
      sql_type = SQL_TINYINT;
      break;
    case DatumStorage::SqlType::SmallInt:
      c_type = SQL_C_SHORT;
      sql_type = SQL_SMALLINT;
      break;
    case DatumStorage::SqlType::Integer:
      c_type = SQL_C_LONG;
      sql_type = SQL_INTEGER;
      break;
    case DatumStorage::SqlType::UnsignedInt:
      c_type = SQL_C_ULONG;
      sql_type = SQL_INTEGER;
      break;
    case DatumStorage::SqlType::BigInt:
      c_type = SQL_C_SBIGINT;
      sql_type = SQL_BIGINT;
      break;
    case DatumStorage::SqlType::Real:
      c_type = SQL_C_FLOAT;
      sql_type = SQL_REAL;
      break;
    case DatumStorage::SqlType::Float:
      c_type = SQL_C_DOUBLE;
      sql_type = SQL_FLOAT;
      break;
    case DatumStorage::SqlType::Double:
      c_type = SQL_C_DOUBLE;
      sql_type = SQL_DOUBLE;
      break;
    case DatumStorage::SqlType::Decimal:
      c_type = SQL_C_NUMERIC;
      sql_type = SQL_DECIMAL;
      break;
    case DatumStorage::SqlType::Numeric:
      c_type = SQL_C_NUMERIC;
      sql_type = SQL_NUMERIC;
      break;
    case DatumStorage::SqlType::Char:
      c_type = SQL_C_CHAR;
      sql_type = SQL_CHAR;
      break;
    case DatumStorage::SqlType::VarChar:
      c_type = SQL_C_CHAR;
      sql_type = SQL_VARCHAR;
      break;
    case DatumStorage::SqlType::Text:
      c_type = SQL_C_CHAR;
      sql_type = SQL_LONGVARCHAR;
      break;
    case DatumStorage::SqlType::NChar:
      c_type = SQL_C_WCHAR;
      sql_type = SQL_WCHAR;
      break;
    case DatumStorage::SqlType::NVarChar:
      c_type = SQL_C_WCHAR;
      sql_type = SQL_WVARCHAR;
      break;
    case DatumStorage::SqlType::NText:
      c_type = SQL_C_WCHAR;
      sql_type = SQL_WLONGVARCHAR;
      break;
    case DatumStorage::SqlType::Binary:
      c_type = SQL_C_BINARY;
      sql_type = SQL_BINARY;
      break;
    case DatumStorage::SqlType::VarBinary:
      c_type = SQL_C_BINARY;
      sql_type = SQL_VARBINARY;
      break;
    case DatumStorage::SqlType::Date:
      c_type = SQL_C_TYPE_DATE;
      sql_type = SQL_TYPE_DATE;
      break;
    case DatumStorage::SqlType::Time:
      c_type = SQL_C_TYPE_TIME;
      sql_type = SQL_TYPE_TIME;
      break;
    case DatumStorage::SqlType::DateTime:
      c_type = SQL_C_TYPE_TIMESTAMP;
      sql_type = SQL_TYPE_TIMESTAMP;
      break;
    case DatumStorage::SqlType::DateTime2:
      c_type = SQL_C_TYPE_TIMESTAMP;
      sql_type = SQL_TYPE_TIMESTAMP;
      break;
    case DatumStorage::SqlType::DateTimeOffset:
      c_type = SQL_C_TYPE_TIMESTAMP;
      sql_type = SQL_TYPE_TIMESTAMP;
      break;
    case DatumStorage::SqlType::Bit:
      c_type = SQL_C_BIT;
      sql_type = SQL_BIT;
      break;
    case DatumStorage::SqlType::Variant:
      c_type = SQL_C_CHAR;
      sql_type = SQL_VARCHAR;
      break;
    case DatumStorage::SqlType::Unknown:
    default:
      // Default to char types if unknown
      c_type = SQL_C_CHAR;
      sql_type = SQL_VARCHAR;
      break;
  }
}

DatumStorage::SqlType QueryParameter::inferTypeFromStorage() {
  // Try to infer the type based on what vectors are actually populated in storage
  auto storage = storage_->getStorage();
  if (!storage || storage->empty()) {
    return DatumStorage::SqlType::VarChar; // Default to varchar for empty/null
  }
  
  // Check the element size to infer the type
  size_t elementSize = storage->element_size();
  
  switch (elementSize) {
    case 1:
      // Could be TinyInt, Bit, or Char
      return DatumStorage::SqlType::TinyInt; // Most common case for 1-byte
    case 2:
      // Could be SmallInt or NChar
      return DatumStorage::SqlType::SmallInt; // Most common case for 2-byte
    case 4:
      // Could be Integer, Real, or Float
      return DatumStorage::SqlType::Integer; // Most common case for 4-byte
    case 8:
      // Could be BigInt or Double
      return DatumStorage::SqlType::BigInt; // Most common case for 8-byte
    default:
      // For variable-length data like strings or binary, default to varchar
      return DatumStorage::SqlType::VarChar;
  }
}
}  // namespace mssql