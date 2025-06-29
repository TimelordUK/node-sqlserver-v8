#pragma once

#include <gmock/gmock.h>

#include "odbc/odbc_row.h"

namespace mssql {
/**
 * @brief Mock implementation of IOdbcRow for testing
 */
class MockOdbcRow : public IOdbcRow {
 public:
  // Mock methods from IOdbcRow
  MOCK_METHOD(DatumStorage&, getColumn, (size_t index), (override));
  MOCK_METHOD(const DatumStorage&, getColumn, (size_t index), (const, override));
  MOCK_METHOD(size_t, columnCount, (), (const, override));
  MOCK_METHOD(void, reserve, (size_t batchSize), (override));
  MOCK_METHOD(void, resize, (size_t batchSize), (override));
  MOCK_METHOD(void, clear, (), (override));
  MOCK_METHOD(void,
              logDebug,
              (LogLevel level, bool showValues, size_t maxValues),
              (const, override));
  MOCK_METHOD(std::string,
              getDebugString,
              (bool showValues, size_t maxValues, bool compactFormat),
              (const, override));
};

}  // namespace mssql