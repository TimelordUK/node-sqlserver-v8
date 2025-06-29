// test/helpers/src/test_data_builder.cpp
#include "platform.h"
#include "odbc_common.h"
#include "test_data_builder.h"
#include <stdexcept>

namespace mssql
{
  namespace test
  {

    TestDataBuilder::~TestDataBuilder() = default;

    TestDataBuilder &TestDataBuilder::withColumns(const std::vector<ColumnDefinition> &columns)
    {
      columnDefs = columns;
      return *this;
    }

    TestDataBuilder &TestDataBuilder::addColumn(const std::string &name, SQLSMALLINT type)
    {
      columnDefs.push_back({name, type});
      return *this;
    }

    TestDataBuilder &TestDataBuilder::addRow(const std::vector<std::string> &rowData)
    {
      if (rowData.size() != columnDefs.size())
      {
        throw std::invalid_argument("Row data size doesn't match column count");
      }
      rows.push_back(rowData);
      return *this;
    }

    TestDataBuilder &TestDataBuilder::addRows(const std::vector<std::vector<std::string>> &rowsData)
    {
      for (const auto &row : rowsData)
      {
        addRow(row);
      }
      return *this;
    }

    std::tuple<std::vector<TestDataBuilder::ColumnDefinition>, std::vector<std::vector<std::string>>>
    TestDataBuilder::build() const
    {
      return {columnDefs, rows};
    }

    std::vector<std::string> TestDataBuilder::getColumnNames() const
    {
      std::vector<std::string> names;
      for (const auto &col : columnDefs)
      {
        names.push_back(col.name);
      }
      return names;
    }

    std::vector<SQLSMALLINT> TestDataBuilder::getColumnTypes() const
    {
      std::vector<SQLSMALLINT> types;
      for (const auto &col : columnDefs)
      {
        types.push_back(col.type);
      }
      return types;
    }

    // Factory method implementations
    TestDataBuilder createEmployeeTestData()
    {
      TestDataBuilder builder;
      builder.addColumn("id", SQL_INTEGER)
          .addColumn("first_name", SQL_VARCHAR)
          .addColumn("last_name", SQL_VARCHAR)
          .addColumn("email", SQL_VARCHAR)
          .addColumn("hire_date", SQL_TYPE_DATE)
          .addColumn("salary", SQL_DECIMAL)
          .addRow({"1", "John", "Doe", "john.doe@example.com", "2020-01-15", "75000.00"})
          .addRow({"2", "Jane", "Smith", "jane.smith@example.com", "2019-03-20", "82000.00"})
          .addRow({"3", "NULL", "Johnson", "bob.johnson@example.com", "2021-05-10", "68000.00"});
      return builder;
    }

    TestDataBuilder createProductTestData()
    {
      TestDataBuilder builder;
      builder.addColumn("product_id", SQL_INTEGER)
          .addColumn("name", SQL_VARCHAR)
          .addColumn("description", SQL_VARCHAR)
          .addColumn("price", SQL_DECIMAL)
          .addColumn("in_stock", SQL_BIT)
          .addRow({"101", "Widget", "A fantastic widget", "19.99", "1"})
          .addRow({"102", "Gadget", "An amazing gadget", "29.99", "1"})
          .addRow({"103", "Doohickey", "NULL", "9.99", "0"});
      return builder;
    }

    TestDataBuilder createFinancialTestData()
    {
      TestDataBuilder builder;
      builder.addColumn("transaction_id", SQL_INTEGER)
          .addColumn("account_id", SQL_INTEGER)
          .addColumn("transaction_date", SQL_TYPE_TIMESTAMP)
          .addColumn("amount", SQL_DECIMAL)
          .addColumn("transaction_type", SQL_VARCHAR)
          .addRow({"1001", "5000", "2023-01-15 10:30:00", "1500.75", "DEPOSIT"})
          .addRow({"1002", "5000", "2023-01-20 14:15:00", "-200.50", "WITHDRAWAL"})
          .addRow({"1003", "5001", "2023-02-01 09:45:00", "3000.00", "TRANSFER"});
      return builder;
    }

  } // namespace test
} // namespace mssql