// test/helpers/include/test_data_builder.h
#pragma once

#include "test_helper_exports.h"
#include <vector>
#include <string>
#include <tuple>
#include <sqlext.h> // For SQL types

namespace mssql
{
  namespace test
  {

    class TEST_HELPER_API TestDataBuilder
    {
    public:
      struct ColumnDefinition
      {
        std::string name;
        SQLSMALLINT type;
        SQLULEN size;
        SQLSMALLINT decimalDigits;
        SQLSMALLINT nullable;

        // Constructor with defaults
        ColumnDefinition(const std::string &name_, SQLSMALLINT type_,
                         SQLULEN size_ = 255,
                         SQLSMALLINT decimalDigits_ = 0,
                         SQLSMALLINT nullable_ = SQL_NULLABLE)
            : name(name_), type(type_), size(size_),
              decimalDigits(decimalDigits_), nullable(nullable_) {}
      };

      // Default constructor
      TestDataBuilder() = default;
      // Destructor
      ~TestDataBuilder();

      // Initialize with column definitions
      TestDataBuilder &withColumns(const std::vector<ColumnDefinition> &columns);

      // Add a simple column with just name and type
      TestDataBuilder &addColumn(const std::string &name, SQLSMALLINT type);

      // Add a row of data (strings for simplicity, will be converted as needed)
      TestDataBuilder &addRow(const std::vector<std::string> &rowData);

      // Add multiple rows at once
      TestDataBuilder &addRows(const std::vector<std::vector<std::string>> &rowsData);

      // Get the prepared test data
      std::tuple<std::vector<ColumnDefinition>, std::vector<std::vector<std::string>>> build() const;

      // Helper to get just column names
      std::vector<std::string> getColumnNames() const;

      // Helper to get just column types
      std::vector<SQLSMALLINT> getColumnTypes() const;

    private:
      std::vector<ColumnDefinition> columnDefs;
      std::vector<std::vector<std::string>> rows;
    };

    // Factory methods for common test data
    TEST_HELPER_API TestDataBuilder createEmployeeTestData();
    TEST_HELPER_API TestDataBuilder createProductTestData();
    TEST_HELPER_API TestDataBuilder createFinancialTestData();
    // Add more factory methods as needed

  } // namespace test
} // namespace mssql