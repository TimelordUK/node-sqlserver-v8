// Helper class to store query results
#pragma once
#include <napi.h>
#include <platform.h>
#include <mutex>
#include <string>
#include <memory>
#include <vector>

namespace mssql
{

  class QueryResult
  {
  public:
    // Methods to add columns and rows
    void addColumn(const std::string &name, int sqlType)
    {
      columns_.push_back({name, sqlType});
    }

    void addRow(const std::vector<std::string> &rowData)
    {
      rows_.push_back(rowData);
    }

    // Get column type by index
    int getColumnType(size_t index) const
    {
      if (index < columns_.size())
      {
        return columns_[index].sqlType;
      }
      throw std::out_of_range("Column index out of range");
    }

    // Method to convert to JavaScript object
    Napi::Object toJSObject(Napi::Env env);

  private:
    struct Column
    {
      std::string name;
      int sqlType;
    };
    std::vector<Column> columns_;
    std::vector<std::vector<std::string>> rows_;
  };
}
