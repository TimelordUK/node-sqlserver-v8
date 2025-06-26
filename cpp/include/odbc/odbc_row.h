#pragma once

#include <Logger.h>

#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

#include "datum_storage.h"  // Include the DatumStorage class

namespace mssql {
// Forward declarations
struct ColumnDefinition;
class QueryResult;

/**
 * @brief Interface for OdbcRow to enable mocking in tests
 */
class IOdbcRow {
 public:
  virtual ~IOdbcRow() = default;

  // Data access methods
  virtual DatumStorage& getColumn(size_t index) = 0;
  virtual const DatumStorage& getColumn(size_t index) const = 0;
  virtual size_t columnCount() const = 0;

  // Row operations
  virtual void reserve(size_t batchSize) = 0;
  virtual void resize(size_t batchSize) = 0;
  virtual void clear() = 0;

  // Debugging
  virtual void logDebug(LogLevel level = LogLevel::Debug,
                        bool showValues = true,
                        size_t maxValues = 5) const = 0;
  virtual std::string getDebugString(bool showValues = true,
                                     size_t maxValues = 5,
                                     bool compactFormat = false) const = 0;
};

/**
 * @brief Represents a row in an ODBC result set or parameter binding
 *
 * The OdbcRow class contains a collection of DatumStorage objects,
 * one for each column in the result set or parameter set. Each DatumStorage
 * can hold multiple values when used in a batch operation.
 */
class OdbcRow : public IOdbcRow {
 public:
  /**
   * @brief Default constructor - creates an empty row
   */
  OdbcRow() = default;

  /**
   * @brief Constructor that initializes from a query result
   * @param queryResult The query result containing column definitions
   */
  explicit OdbcRow(const QueryResult& queryResult);

  /**
   * @brief Constructor that initializes from column definitions
   * @param columnDefs Vector of column definitions
   */
  explicit OdbcRow(const std::vector<ColumnDefinition>& columnDefs);

  /**
   * @brief Copy constructor deleted to prevent accidental copies
   */
  OdbcRow(const OdbcRow&) = delete;

  /**
   * @brief Assignment operator deleted to prevent accidental copies
   */
  OdbcRow& operator=(const OdbcRow&) = delete;

  /**
   * @brief Move constructor
   */
  OdbcRow(OdbcRow&&) noexcept = default;

  /**
   * @brief Move assignment operator
   */
  OdbcRow& operator=(OdbcRow&&) noexcept = default;

  /**
   * @brief Destructor
   */
  ~OdbcRow() override = default;

  /**
   * @brief Get a DatumStorage for a column by index
   * @param index The column index (0-based)
   * @return Reference to the DatumStorage
   * @throws std::out_of_range if index is out of range
   */
  DatumStorage& getColumn(size_t index) override;

  /**
   * @brief Get a const DatumStorage for a column by index
   * @param index The column index (0-based)
   * @return Const reference to the DatumStorage
   * @throws std::out_of_range if index is out of range
   */
  const DatumStorage& getColumn(size_t index) const override;

  /**
   * @brief Get the number of columns in the row
   * @return The number of columns
   */
  size_t columnCount() const override;

  /**
   * @brief Reserve space for batch operations
   * @param batchSize The number of rows to reserve space for
   */
  void reserve(size_t batchSize) override;

  /**
   * @brief Resize all columns to the specified batch size
   * @param batchSize The number of rows to resize to
   */
  void resize(size_t batchSize) override;

  /**
   * @brief Clear all data in all columns
   */
  void clear() override;

  /**
   * @brief Log debug information about this row
   * @param level The log level to use
   * @param showValues Whether to show data values
   * @param maxValues Maximum number of values to show
   */
  void logDebug(LogLevel level = LogLevel::Debug,
                bool showValues = true,
                size_t maxValues = 5) const override;

  /**
   * @brief Get a string representation of this row for debugging
   * @param showValues Whether to show data values
   * @param maxValues Maximum number of values to show
   * @param compactFormat Whether to use compact formatting
   * @return A string representation of the row
   */
  std::string getDebugString(bool showValues = true,
                             size_t maxValues = 5,
                             bool compactFormat = false) const override;

  /**
   * @brief Helper method for convenience logging at error level
   */
  void logError(bool showValues = true, size_t maxValues = 5) const;

  /**
   * @brief Helper method for convenience logging at warning level
   */
  void logWarning(bool showValues = true, size_t maxValues = 5) const;

  /**
   * @brief Helper method for convenience logging at info level
   */
  void logInfo(bool showValues = true, size_t maxValues = 5) const;

  /**
   * @brief Helper method for convenience logging at trace level
   */
  void logTrace(bool showValues = true, size_t maxValues = 5) const;

  /**
   * @brief Convert ODBC SQL type to DatumStorage::SqlType
   * @param sqlType ODBC SQL type from SQL_* constants
   * @return The corresponding DatumStorage::SqlType
   */
  static DatumStorage::SqlType convertSqlType(SQLSMALLINT sqlType);

 private:
  /**
   * @brief Initialize columns based on column definitions
   * @param columnDefs The column definitions to use
   */
  void initializeColumns(const std::vector<ColumnDefinition>& columnDefs);

  // The vector of DatumStorage objects, one for each column
  std::vector<std::shared_ptr<DatumStorage>> columns_;
};

}  // namespace mssql