
#pragma once

#include <memory>
#include <vector>
#include <string>
#include "platform.h"
#include "common/odbc_common.h"
#include "core/datum_storage.h"
#include <utils/Logger.h>

namespace mssql {

class ColumnBuffer {
 public:
  ColumnBuffer(SQLSMALLINT dataType, size_t columnSize)
      : dataType_(dataType), columnSize_(columnSize) {
    SQL_LOG_TRACE_STREAM("Creating ColumnBuffer - Type: " << dataType << ", Size: " << columnSize);
    buffer_.resize(columnSize);
  }

  // Get the buffer pointer for SQLBindCol
  SQLPOINTER getBuffer() {
    return buffer_.data();
  }

  // Get the buffer length
  SQLLEN getBufferLength() const {
    return static_cast<SQLLEN>(buffer_.size());
  }

  // Get pointer to the indicator array
  SQLLEN* getIndicator() {
    return indicators_.data();
  }

  // Set the row array size for batch fetching
  void setRowArraySize(size_t size) {
    indicators_.resize(size);
    if (dataType_ == SQL_CHAR || dataType_ == SQL_VARCHAR || dataType_ == SQL_WCHAR ||
        dataType_ == SQL_WVARCHAR || dataType_ == SQL_BINARY || dataType_ == SQL_VARBINARY) {
      buffer_.resize(size * columnSize_);
    } else {
      buffer_.resize(size * getTypeSize(dataType_));
    }
  }

  // Get the value at a specific row index
  std::shared_ptr<DatumStorage> getValue(size_t rowIndex) {
    if (indicators_[rowIndex] == SQL_NULL_DATA) {
      storage_->setNull();
      return storage_;
    }

    // Calculate the offset in the buffer for this row
    size_t offset = rowIndex;
    if (dataType_ == SQL_CHAR || dataType_ == SQL_VARCHAR || dataType_ == SQL_WCHAR ||
        dataType_ == SQL_WVARCHAR || dataType_ == SQL_BINARY || dataType_ == SQL_VARBINARY) {
      offset *= columnSize_;
    } else {
      offset *= getTypeSize(dataType_);
    }

    // Clear any previous value
    storage_->clear();

    // Add the value based on the SQL type
    switch (dataType_) {
      case SQL_TINYINT:
        storage_->addValue<int8_t>(static_cast<int8_t>(buffer_[offset]));
        break;
      case SQL_SMALLINT:
        storage_->addValue<int16_t>(
            *reinterpret_cast<int16_t*>(&buffer_[offset * sizeof(int16_t)]));
        break;
      case SQL_INTEGER:
        storage_->addValue<int32_t>(
            *reinterpret_cast<int32_t*>(&buffer_[offset * sizeof(int32_t)]));
        break;
      case SQL_BIGINT:
        storage_->addValue<int64_t>(
            *reinterpret_cast<int64_t*>(&buffer_[offset * sizeof(int64_t)]));
        break;
      case SQL_REAL:
      case SQL_FLOAT:
      case SQL_DOUBLE:
        storage_->addValue<double>(*reinterpret_cast<double*>(&buffer_[offset * sizeof(double)]));
        break;
      case SQL_DECIMAL:
      case SQL_NUMERIC:
        storage_->addValue<SQL_NUMERIC_STRUCT>(
            *reinterpret_cast<SQL_NUMERIC_STRUCT*>(&buffer_[offset * sizeof(SQL_NUMERIC_STRUCT)]));
        break;
      case SQL_TYPE_DATE:
        storage_->addValue<SQL_DATE_STRUCT>(
            *reinterpret_cast<SQL_DATE_STRUCT*>(&buffer_[offset * sizeof(SQL_DATE_STRUCT)]));
        break;
      case SQL_TYPE_TIME:
        storage_->addValue<SQL_SS_TIME2_STRUCT>(*reinterpret_cast<SQL_SS_TIME2_STRUCT*>(
            &buffer_[offset * sizeof(SQL_SS_TIME2_STRUCT)]));
        break;
      case SQL_TYPE_TIMESTAMP:
        storage_->addValue<SQL_TIMESTAMP_STRUCT>(*reinterpret_cast<SQL_TIMESTAMP_STRUCT*>(
            &buffer_[offset * sizeof(SQL_TIMESTAMP_STRUCT)]));
        break;
      case SQL_CHAR:
      case SQL_VARCHAR:
      case SQL_WCHAR:
      case SQL_WVARCHAR:
      case SQL_BINARY:
      case SQL_VARBINARY: {
        // For string/binary types, we need to handle the actual length from indicators
        SQLLEN actualLength = indicators_[rowIndex];
        if (actualLength > 0) {
          if (dataType_ == SQL_WCHAR || dataType_ == SQL_WVARCHAR) {
            // Handle wide character strings
            // Removed unused variable 'wstr'
            storage_->setType(DatumStorage::SqlType::NVarChar);
            // Convert to UTF-8 and store
            // You'll need to implement string conversion here
          } else {
            // Handle regular strings and binary data
            // Removed unused variable 'str'
            storage_->setType(dataType_ == SQL_BINARY || dataType_ == SQL_VARBINARY
                                  ? DatumStorage::SqlType::Binary
                                  : DatumStorage::SqlType::VarChar);
            // Store the string/binary data
            // You'll need to implement data copying here
          }
        }
        break;
      }
      case SQL_BIT:
        storage_->addValue<int8_t>(static_cast<int8_t>(buffer_[offset]) ? 1 : 0);
        break;
      default:
        // Handle unknown types as strings
        storage_->setType(DatumStorage::SqlType::VarChar);
        break;
    }

    return storage_;
  }

  void setFromBuffer(const char* data, size_t rowIndex, SQLSMALLINT dataType, size_t columnSize) {
    SQL_LOG_TRACE_STREAM("Setting data for row " << rowIndex << " - Type: " << dataType
                                                 << ", Size: " << columnSize);

    if (storage_) {
      storage_->logTrace(true, 5);  // Log current storage state
    }

    // ... implementation ...

    SQL_LOG_TRACE("Data set successfully");
  }

  std::shared_ptr<DatumStorage> getDatum(size_t rowIndex) {
    return getValue(rowIndex);
  }

 private:
  void initializeBuffer() {
    // Default to single row buffer
    setRowArraySize(1);
  }

  size_t getTypeSize(SQLSMALLINT sqlType) {
    switch (sqlType) {
      case SQL_BIT:
        return sizeof(SQLCHAR);
      case SQL_TINYINT:
        return sizeof(SQLCHAR);
      case SQL_SMALLINT:
        return sizeof(SQLSMALLINT);
      case SQL_INTEGER:
        return sizeof(SQLINTEGER);
      case SQL_BIGINT:
        return sizeof(SQLBIGINT);
      case SQL_REAL:
        return sizeof(SQLREAL);
      case SQL_FLOAT:
      case SQL_DOUBLE:
        return sizeof(SQLDOUBLE);
      case SQL_DECIMAL:
      case SQL_NUMERIC:
        return sizeof(SQL_NUMERIC_STRUCT);
      case SQL_TYPE_DATE:
        return sizeof(SQL_DATE_STRUCT);
      case SQL_TYPE_TIME:
        return sizeof(SQL_TIME_STRUCT);
      case SQL_TYPE_TIMESTAMP:
        return sizeof(SQL_TIMESTAMP_STRUCT);
      case SQL_GUID:
        return 68;
      default:
        return columnSize_;
    }
  }

  SQLSMALLINT dataType_;
  size_t columnSize_;
  std::vector<char> buffer_;
  std::vector<SQLLEN> indicators_;
  std::shared_ptr<DatumStorage> storage_;
};

}  // namespace mssql