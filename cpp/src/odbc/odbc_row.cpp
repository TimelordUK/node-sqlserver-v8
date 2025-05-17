#include <odbc/odbc_row.h>

#include <iomanip>
#include <sstream>

#include <odbc/odbc_driver_types.h>
#include <core/query_result.h>

namespace mssql {
// Constructor that initializes from a query result
OdbcRow::OdbcRow(const QueryResult& queryResult) {
  // Extract column definitions from the query result
  std::vector<ColumnDefinition> columnDefs;
  for (size_t i = 0; i < queryResult.get_column_count(); ++i) {
    columnDefs.push_back(queryResult.get(i));
  }

  // Initialize columns based on the extracted definitions
  initializeColumns(columnDefs);
}

// Constructor that initializes from column definitions
OdbcRow::OdbcRow(const std::vector<ColumnDefinition>& columnDefs) {
  initializeColumns(columnDefs);
}

// Get a DatumStorage for a column by index
DatumStorage& OdbcRow::getColumn(size_t index) {
  if (index >= columns_.size()) {
    throw std::out_of_range("Column index out of range");
  }
  return *columns_[index];
}

// Get a const DatumStorage for a column by index
const DatumStorage& OdbcRow::getColumn(size_t index) const {
  if (index >= columns_.size()) {
    throw std::out_of_range("Column index out of range");
  }
  return *columns_[index];
}

// Get the number of columns in the row
size_t OdbcRow::columnCount() const {
  return columns_.size();
}

// Reserve space for batch operations
void OdbcRow::reserve(size_t batchSize) {
  for (auto& column : columns_) {
    column->reserve(batchSize);
  }
}

// Resize all columns to the specified batch size
void OdbcRow::resize(size_t batchSize) {
  for (auto& column : columns_) {
    column->resize(batchSize);
  }
}

// Clear all data in all columns
void OdbcRow::clear() {
  for (auto& column : columns_) {
    column->clear();
  }
}

// Log debug information about this row
void OdbcRow::logDebug(LogLevel level, bool showValues, size_t maxValues) const {
  Logger::GetInstance().Log(level, getDebugString(showValues, maxValues, true));
}

// Helper method for convenience logging at error level
void OdbcRow::logError(bool showValues, size_t maxValues) const {
  logDebug(LogLevel::Error, showValues, maxValues);
}

// Helper method for convenience logging at warning level
void OdbcRow::logWarning(bool showValues, size_t maxValues) const {
  logDebug(LogLevel::Warning, showValues, maxValues);
}

// Helper method for convenience logging at info level
void OdbcRow::logInfo(bool showValues, size_t maxValues) const {
  logDebug(LogLevel::Info, showValues, maxValues);
}

// Helper method for convenience logging at trace level
void OdbcRow::logTrace(bool showValues, size_t maxValues) const {
  logDebug(LogLevel::Trace, showValues, maxValues);
}

// Get a string representation of this row for debugging
std::string OdbcRow::getDebugString(bool showValues, size_t maxValues, bool compactFormat) const {
  std::ostringstream oss;

  if (compactFormat) {
    oss << "OdbcRow[" << columns_.size() << " columns]:";
    for (size_t i = 0; i < columns_.size(); ++i) {
      oss << " Col" << i << "(" << columns_[i]->getTypeName() << ")";
      if (showValues) {
        oss << "=" << columns_[i]->getDebugString(true, maxValues, true);
      }
      if (i < columns_.size() - 1) {
        oss << ",";
      }
    }
  } else {
    oss << "OdbcRow with " << columns_.size() << " columns:" << std::endl;
    for (size_t i = 0; i < columns_.size(); ++i) {
      oss << "  Column " << i << ": Type=" << columns_[i]->getTypeName();
      if (showValues) {
        oss << std::endl << "    Values: " << columns_[i]->getDebugString(true, maxValues, false);
      }
      oss << std::endl;
    }
  }

  return oss.str();
}

// Convert ODBC SQL type to DatumStorage::SqlType
DatumStorage::SqlType OdbcRow::convertSqlType(SQLSMALLINT sqlType) {
  // Map ODBC SQL types to DatumStorage SQL types
  switch (sqlType) {
    case SQL_TINYINT:
      return DatumStorage::SqlType::TinyInt;
    case SQL_SMALLINT:
      return DatumStorage::SqlType::SmallInt;
    case SQL_INTEGER:
      return DatumStorage::SqlType::Integer;
    case SQL_BIGINT:
      return DatumStorage::SqlType::BigInt;
    case SQL_REAL:
      return DatumStorage::SqlType::Real;
    case SQL_FLOAT:
    case SQL_DOUBLE:
      return DatumStorage::SqlType::Double;
    case SQL_DECIMAL:
    case SQL_NUMERIC:
      return DatumStorage::SqlType::Numeric;
    case SQL_CHAR:
      return DatumStorage::SqlType::Char;
    case SQL_VARCHAR:
      return DatumStorage::SqlType::VarChar;
    case SQL_LONGVARCHAR:
      return DatumStorage::SqlType::Text;
    case SQL_WCHAR:
      return DatumStorage::SqlType::NChar;
    case SQL_WVARCHAR:
      return DatumStorage::SqlType::NVarChar;
    case SQL_WLONGVARCHAR:
      return DatumStorage::SqlType::NText;
    case SQL_BINARY:
      return DatumStorage::SqlType::Binary;
    case SQL_VARBINARY:
    case SQL_LONGVARBINARY:
      return DatumStorage::SqlType::VarBinary;
    case SQL_TYPE_DATE:
      return DatumStorage::SqlType::Date;
    case SQL_TYPE_TIME:
    case SQL_SS_TIME2:
      return DatumStorage::SqlType::Time;
    case SQL_TYPE_TIMESTAMP:
      return DatumStorage::SqlType::DateTime;
    case SQL_SS_TIMESTAMPOFFSET:
      return DatumStorage::SqlType::DateTimeOffset;
    case SQL_BIT:
      return DatumStorage::SqlType::Bit;
    default:
      // For types we don't explicitly handle, default to Variant
      return DatumStorage::SqlType::Variant;
  }
}

// Initialize columns based on column definitions
void OdbcRow::initializeColumns(const std::vector<ColumnDefinition>& columnDefs) {
  columns_.clear();
  columns_.reserve(columnDefs.size());

  for (const auto& def : columnDefs) {
    // Create a new DatumStorage with the appropriate SQL type
    auto sqlType = convertSqlType(def.dataType);
    auto storage = std::make_shared<DatumStorage>(sqlType);
    columns_.push_back(storage);
  }
}

}  // namespace mssql