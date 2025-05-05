// C++ equivalent of ProcedureParamMeta and NativeParam

#pragma once

#include "common/platform.h"
#include "common/odbc_common.h"
#include <iostream>
#include <ostream>
#include <variant>
#include <vector>

// Common ODBC utility functions and constants
namespace mssql
{
  class DatumStorage;
  class StatementHandle
  {
  private:
    int connection_id;
    int statement_id;

  public:
    // Add a default constructor
    StatementHandle() : connection_id(-1), statement_id(-1) {}

    StatementHandle(int conn_id, int stmt_id)
        : connection_id(conn_id), statement_id(stmt_id)
    {
    }

    int getConnectionId() const { return connection_id; }
    int getStatementId() const { return statement_id; }

    // For comparisons
    bool operator==(const StatementHandle &other) const
    {
      return connection_id == other.connection_id &&
             statement_id == other.statement_id;
    }

    // String representation for debugging
    std::string toString() const
    {
      return "Connection: " + std::to_string(connection_id) +
             ", Statement: " + std::to_string(statement_id);
    }

    // Add a method to check if the handle is valid
    bool isValid() const
    {
      return connection_id >= 0 && statement_id >= 0;
    }
  };

  struct ColumnDefinition
  {
    SQLWCHAR colName[256];
    SQLSMALLINT colNameLen;
    SQLSMALLINT dataType;
    SQLULEN columnSize;
    SQLSMALLINT decimalDigits;
    SQLSMALLINT nullable;

    // String representation for debugging
    std::string toString() const
    {
      std::string result = "Column: ";

      // Convert wide string to regular string for display
      std::string name(colNameLen, ' ');
      for (int i = 0; i < colNameLen; i++)
      {
        name[i] = static_cast<char>(colName[i]);
      }

      result += name;
      result += ", Type: " + std::to_string(dataType);
      result += ", Size: " + std::to_string(columnSize);
      result += ", Decimal digits: " + std::to_string(decimalDigits);
      result += ", Nullable: " + std::string(nullable ? "Yes" : "No");

      return result;
    }
  };

  typedef vector<shared_ptr<DatumStorage>> t_row;

  class QueryResult
  {
  public:
    // Default constructor
    QueryResult() : handle_(-1, -1) {}

    // Constructor with handle
    QueryResult(StatementHandle handle) : handle_(handle) {}

    // Methods to add columns and rows
    void addColumn(ColumnDefinition d)
    {
      columns_.push_back(d);
    }

    void setHandle(StatementHandle handle)
    {
      handle_ = handle;
    }

    inline void start_results()
    {
      rows_.clear();
    }

    inline size_t get_result_count() const
    {
      return rows_.size();
    }

    inline bool is_end_of_rows() const
    {
      return end_of_rows_;
    }

    inline void set_end_of_rows(bool end_of_rows)
    {
      end_of_rows_ = end_of_rows;
    }

    inline size_t get_row_count() const
    {
      return row_count_;
    }

    inline void set_row_count(size_t row_count)
    {
      row_count_ = row_count;
    }

    // Use "inline" correctly and make these methods const since they don't modify the object
    inline size_t size() const { return columns_.size(); }
    inline size_t get_column_count() const { return columns_.size(); }
    inline ColumnDefinition get(size_t i) const { return columns_[i]; }
    inline StatementHandle getHandle() const { return handle_; }

  private:
    std::vector<ColumnDefinition> columns_;
    std::vector<t_row> rows_;
    bool end_of_rows_;
    size_t row_count_;
    StatementHandle handle_;
  };

  // Existing structure
  struct ProcedureParamMeta
  {
    std::string proc_name;
    std::string type_desc;
    int64_t object_id;
    bool has_default_value;
    std::string default_value;
    bool is_output;
    std::string name;
    std::string type_id;
    int max_length;
    int order;
    std::string collation;
    bool is_user_defined;
  };

  // sqlQueryParamType equivalent
  using SqlParamValue = std::variant<
      std::nullptr_t,
      bool,
      int32_t,
      int64_t,
      double,
      std::string,
      std::vector<uint8_t> // for binary data
      >;

  // New structure for NativeParam
  struct NativeParam
  {
    bool is_user_defined = false;
    int32_t type_id = 0;
    std::string schema;
    bool bcp = false;
    int32_t bcp_version = 0;
    std::string table_name;
    int32_t ordinal_position = 0;
    int32_t scale = 0;
    int32_t offset = 0;
    int32_t precision = 0;
    bool is_output = false;
    std::string name;
    SqlParamValue value;
  };

  inline std::ostream &operator<<(std::ostream &os, const ProcedureParamMeta &param)
  {
    os << "ProcedureParamMeta {\n"
       << "  proc_name: " << param.proc_name << ",\n"
       << "  type_desc: " << param.type_desc << ",\n"
       << "  object_id: " << param.object_id << ",\n"
       << "  has_default_value: " << (param.has_default_value ? "true" : "false") << ",\n"
       << "  default_value: " << param.default_value << ",\n"
       << "  is_output: " << (param.is_output ? "true" : "false") << ",\n"
       << "  name: " << param.name << ",\n"
       << "  type_id: " << param.type_id << ",\n"
       << "  max_length: " << param.max_length << ",\n"
       << "  order: " << param.order << ",\n"
       << "  collation: " << param.collation << ",\n"
       << "  is_user_defined: " << (param.is_user_defined ? "true" : "false") << "\n"
       << "}";
    return os;
  }

  inline std::ostream &operator<<(std::ostream &os, const NativeParam &param)
  {
    os << "NativeParam {\n"
       << "  is_user_defined: " << (param.is_user_defined ? "true" : "false") << ",\n"
       << "  type_id: " << param.type_id << ",\n"
       << "  schema: " << param.schema << ",\n"
       << "  bcp: " << (param.bcp ? "true" : "false") << ",\n"
       << "  bcp_version: " << param.bcp_version << ",\n"
       << "  table_name: " << param.table_name << ",\n"
       << "  ordinal_position: " << param.ordinal_position << ",\n"
       << "  scale: " << param.scale << ",\n"
       << "  offset: " << param.offset << ",\n"
       << "  precision: " << param.precision << ",\n"
       << "  is_output: " << (param.is_output ? "true" : "false") << ",\n"
       << "  name: " << param.name << "\n"
       << "  // value field omitted as it's a variant type\n"
       << "}";
    return os;
  }
}