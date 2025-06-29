//---------------------------------------------------------------------------------------------------------------------------------
// File: result_buffer.h
// Contents: Buffer management for result sets
//
// Copyright Microsoft Corporation and contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
//
// You may obtain a copy of the License at:
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//---------------------------------------------------------------------------------------------------------------------------------

#pragma once

#include <memory>
#include <vector>
#include "core/column_buffer.h"
#include "core/query_result.h"
#include <platform.h>
#include <utils/Logger.h>

namespace mssql {

class ResultBuffer {
 public:
  ResultBuffer(size_t columnCount, size_t rowCount) {
    SQL_LOG_TRACE_STREAM("Creating ResultBuffer - Columns: " << columnCount
                                                             << ", Rows: " << rowCount);
    columns_.resize(columnCount);
  }

  void setRowArraySize(size_t size) {
    rowArraySize_ = size;
    for (auto& col : columns_) {
      col->setRowArraySize(size);
    }
  }

  bool fetchRows(std::shared_ptr<QueryResult>& result) {
    SQL_LOG_TRACE("Fetching next batch of results");
    SQLRETURN ret;
    SQLULEN rowsFetched = 0;

    // Set the row array size
    SQLSetStmtAttr(statement_, SQL_ATTR_ROW_ARRAY_SIZE, (SQLPOINTER)rowArraySize_, 0);
    SQLSetStmtAttr(statement_, SQL_ATTR_ROWS_FETCHED_PTR, &rowsFetched, 0);

    // Fetch a batch of rows
    ret = SQLFetch(statement_);

    if (ret == SQL_NO_DATA) {
      SQL_LOG_TRACE("No more data found");
      return false;
    }

    if (!SQL_SUCCEEDED(ret)) {
      SQL_LOG_ERROR("SQLFetch failed");
      return false;
    }

    // Process each row in the batch
    for (SQLULEN row = 0; row < rowsFetched; row++) {
      SQL_LOG_TRACE_STREAM("Processing row " << row << " of " << rowsFetched);
      std::vector<std::shared_ptr<DatumStorage>> rowData;
      rowData.reserve(columns_.size());

      for (size_t col = 0; col < columns_.size(); col++) {
        // Get the raw datum storage which maintains type information
        auto value = columns_[col]->getDatum(row);
        rowData.push_back(value);

        SQL_LOG_TRACE_STREAM("Column " << col << " type: " << static_cast<int>(value->getType()));
      }

      // Add the typed row data to the result
      // result->addTypedRow(rowData);
    }

    SQL_LOG_TRACE_STREAM("Fetched " << rowsFetched << " rows");
    return true;
  }

  bool hasMoreRows() const {
    SQL_LOG_TRACE_STREAM("Checking for more rows - Current position: " << currentRow_ << "/"
                                                                       << totalRows_);
    return currentRow_ < totalRows_;
  }

  void addTypedRow(const std::vector<std::shared_ptr<DatumStorage>>& rowData) {
    rows_.push_back(rowData);
  }

 private:
  SQLSMALLINT getTargetType(SQLSMALLINT sqlType) {
    switch (sqlType) {
      case SQL_CHAR:
      case SQL_VARCHAR:
      case SQL_LONGVARCHAR:
        return SQL_C_CHAR;
      case SQL_WCHAR:
      case SQL_WVARCHAR:
      case SQL_WLONGVARCHAR:
        return SQL_C_WCHAR;
      case SQL_DECIMAL:
      case SQL_NUMERIC:
        return SQL_C_NUMERIC;
      case SQL_SMALLINT:
        return SQL_C_SSHORT;
      case SQL_INTEGER:
        return SQL_C_SLONG;
      case SQL_REAL:
        return SQL_C_FLOAT;
      case SQL_FLOAT:
      case SQL_DOUBLE:
        return SQL_C_DOUBLE;
      case SQL_BIT:
        return SQL_C_BIT;
      case SQL_TINYINT:
        return SQL_C_TINYINT;
      case SQL_BIGINT:
        return SQL_C_SBIGINT;
      case SQL_BINARY:
      case SQL_VARBINARY:
      case SQL_LONGVARBINARY:
        return SQL_C_BINARY;
      case SQL_TYPE_DATE:
        return SQL_C_TYPE_DATE;
      case SQL_TYPE_TIME:
        return SQL_C_TYPE_TIME;
      case SQL_TYPE_TIMESTAMP:
        return SQL_C_TYPE_TIMESTAMP;
      case SQL_GUID:
        return SQL_C_GUID;
      default:
        return SQL_C_CHAR;
    }
  }

  SQLHSTMT statement_;
  size_t rowArraySize_;
  std::vector<std::shared_ptr<ColumnBuffer>> columns_;
  std::vector<std::vector<std::shared_ptr<DatumStorage>>> rows_;
  size_t currentRow_ = 0;
  size_t totalRows_ = 0;
  size_t rowsFetched_ = 0;
};

}  // namespace mssql