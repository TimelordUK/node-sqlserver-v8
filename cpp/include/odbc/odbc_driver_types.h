// C++ equivalent of ProcedureParamMeta and NativeParam

#pragma once

#include <iostream>
#include <ostream>
#include <variant>
#include <vector>

#include "common/odbc_common.h"
#include "common/platform.h"
#include "common/string_utils.h"
#include "core/datum_storage.h"

// Common ODBC utility functions and constants
namespace mssql {
class DatumStorage;

class StatementHandle {
 private:
  int connection_id;
  int statement_id;

 public:
  // Add a default constructor
  StatementHandle() : connection_id(-1), statement_id(-1) {}

  StatementHandle(int conn_id, int stmt_id) : connection_id(conn_id), statement_id(stmt_id) {}

  int getConnectionId() const {
    return connection_id;
  }

  int getStatementId() const {
    return statement_id;
  }

  // For comparisons
  bool operator==(const StatementHandle& other) const {
    return connection_id == other.connection_id && statement_id == other.statement_id;
  }

  // String representation for debugging
  std::string toString() const {
    return "CID: " + std::to_string(connection_id) + ", STMT: " + std::to_string(statement_id);
  }

  // Add a method to check if the handle is valid
  bool isValid() const {
    return connection_id >= 0 && statement_id >= 0;
  }
};

struct ColumnDefinition {
  // SQLWCHAR colName[256];
  SQLSMALLINT colNameLen;
  SQLSMALLINT dataType;
  SQLULEN columnSize;
  std::string dataTypeName;
  SQLSMALLINT decimalDigits;
  SQLSMALLINT nullable;
  std::string udtTypeName;
  vector<SQLWCHAR> name;

  // String representation for debugging
  std::string toString() const {
    std::string result = "Column: ";

    // Convert wide string to regular string for display
    std::string name(colNameLen, ' ');
    for (int i = 0; i < colNameLen; i++) {
      name[i] = static_cast<char>(name[i]);
    }

    result += name;
    result += ", Type: " + std::to_string(dataType);
    result += ", Size: " + std::to_string(columnSize);
    result += ", Decimal digits: " + std::to_string(decimalDigits);
    result += ", Nullable: " + std::string(nullable ? "Yes" : "No");

    return result;
  }
};

class QueryResult {
 public:
  // Default constructor
 public:
  // Default constructor - maintain same order as declaration
  QueryResult()
      : columns_(), end_of_rows_(false), end_of_results_(false), row_count_(0), handle_(-1, -1) {}

  // Constructor with handle - maintain same order as declaration
  QueryResult(StatementHandle handle)
      : columns_(), end_of_rows_(false), end_of_results_(false), row_count_(0), handle_(handle) {}

  // Methods to add columns and rows
  void addColumn(ColumnDefinition d) {
    columns_.push_back(d);
  }

  void setHandle(StatementHandle handle) {
    handle_ = handle;
  }

  inline bool is_end_of_rows() const {
    return end_of_rows_;
  }

  inline void set_end_of_results(bool end_of_results) {
    end_of_results_ = end_of_results;
  }

  inline void set_end_of_rows(bool end_of_rows) {
    end_of_rows_ = end_of_rows;
  }

  inline bool is_end_of_results() const {
    return end_of_results_;
  }

  inline size_t get_row_count() const {
    return row_count_;
  }

  inline void set_row_count(size_t row_count) {
    row_count_ = row_count;
  }

  // Use "inline" correctly and make these methods const since they don't modify the object
  inline size_t size() const {
    return columns_.size();
  }
  inline size_t get_column_count() const {
    return columns_.size();
  }
  inline ColumnDefinition get(size_t i) const {
    return columns_[i];
  }
  inline StatementHandle getHandle() const {
    return handle_;
  }

  // String representation for debugging
  std::string toString() const {
    std::string result = "QueryResult: ";
    // Assuming StatementHandle has its own toString method
    result += " handle: " + handle_.toString();
    // Fix string concatenation with conditional expressions
    result += ", end_of_rows: ";
    result += (end_of_rows_ ? "true" : "false");
    result += ", end_of_results: ";
    result += (end_of_results_ ? "true" : "false");
    result += ", row_count: " + std::to_string(row_count_);
    result += ", columns: " + std::to_string(columns_.size());
    return result;
  }

 private:
  std::vector<ColumnDefinition> columns_;
  bool end_of_rows_;
  bool end_of_results_;
  size_t row_count_;
  StatementHandle handle_;
};

class StatementStateChange {
 public:
  StatementHandle statementHandle;
  std::string oldState;
  std::string newState;

  // Default constructor
  StatementStateChange() = default;

  // Constructor with parameters
  StatementStateChange(const StatementHandle& handle, const std::string& old_state, const std::string& new_state)
      : statementHandle(handle), oldState(old_state), newState(new_state) {}

  std::string toString() const {
    return "StatementStateChange: " + statementHandle.toString() + " " + oldState + " -> " +
           newState;
  }
};

class QueryOperationParams {
 public:
  std::u16string query_string;
  int32_t timeout;
  int32_t query_tz_adjustment;
  int32_t id;
  size_t max_prepared_column_size;
  bool numeric_string;
  bool polling;

  std::string toString() const {
    std::string result = "QueryOperationParams: ";
    result += "query_string: [ " + StringUtils::U16StringToUtf8(query_string) + " ]";
    result += ", timeout: " + std::to_string(timeout);
    result += ", query_tz_adjustment: " + std::to_string(query_tz_adjustment);
    result += ", id: " + std::to_string(id);
    result += ", max_prepared_column_size: " + std::to_string(max_prepared_column_size);
    result += ", numeric_string: " + std::to_string(numeric_string);
    result += ", polling: " + std::to_string(polling);
    return result;
  }
};

struct QueryOptions {
  bool as_objects;
  bool as_arrays;
  int batch_size;

  std::string toString() const {
    std::string result = "QueryOptions: ";
    result += ", as_objects: ";
    result += (as_objects ? "true" : "false");
    result += ", as_arrays: ";
    result += (as_arrays ? "true" : "false");
    result += ", batch_size: " + std::to_string(batch_size);
    return result;
  }
};

// Existing structure
struct ProcedureParamMeta {
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

struct SqlParameter {
  std::string type;
  std::string element_type;
  std::string sql_type;
  std::string js_type;
  std::string c_type;
  std::string param_type;
  int32_t precision;
  int32_t scale;
  int32_t param_size;
  int32_t buffer_len;
  int32_t digits;
  std::string encoding;
  // Add this new member
  std::shared_ptr<mssql::DatumStorage> storage;
  std::vector<SQLLEN> indvec;

  // Array parameter support
  bool is_array;
  size_t array_length;

  // Constructor with storage initialization
  SqlParameter()
      : precision(0),
        scale(0),
        param_size(0),
        buffer_len(0),
        storage(std::make_shared<mssql::DatumStorage>()),
        is_array(false),
        array_length(1) {}
};

struct NativeParam {
  bool is_user_defined;
  int type_id;
  string schema;
  bool bcp;
  int bcp_version;
  string table_name;
  int ordinal_position;
  int scale;
  int offset;
  int precision;
  bool is_output;
  std::string name;
};

inline std::ostream& operator<<(std::ostream& os, const NativeParam& param) {
  os << "NativeParam {\n"
     << "  is_user_defined: " << param.is_user_defined << ",\n"
     << "  type_id: " << param.type_id << ",\n"
     << "  schema: " << param.schema << ",\n"
     << "  bcp: " << param.bcp << ",\n"
     << "  bcp_version: " << param.bcp_version << ",\n"
     << "  table_name: " << param.table_name << ",\n"
     << "  ordinal_position: " << param.ordinal_position << ",\n"
     << "  scale: " << param.scale << ",\n"
     << "  offset: " << param.offset << ",\n"
     << "  precision: " << param.precision << ",\n"
     << "  is_output: " << param.is_output << ",\n"
     << "  name: " << param.name << "\n"
     << "}";
  return os;
}

inline std::ostream& operator<<(std::ostream& os, const ProcedureParamMeta& param) {
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

inline std::ostream& operator<<(std::ostream& os, const SqlParameter& param) {
  os << "SqlParameter {\n"
     << "  type: " << param.type << ",\n"
     << "  element_type: " << param.element_type << ",\n"
     << "  param_type: " << param.param_type << ",\n"
     << "  sql_type: " << param.sql_type << ",\n"
     << "  js_type: " << param.js_type << ",\n"
     << "  c_type: " << param.c_type << ",\n"
     << "  precision: " << param.precision << ",\n"
     << "  scale: " << param.scale << ",\n"
     << "  param_size: " << param.param_size << ",\n"
     << "  buffer_len: " << param.buffer_len << ",\n"
     << "  digits: " << param.digits << ",\n"
     << "  encoding: " << param.encoding << "\n"
     << "  // value field omitted as it's a variant type\n"
     << "}";
  return os;
}

inline std::ostream& operator<<(std::ostream& os, const QueryOptions& param) {
  os << "QueryOptions {\n"
     << "  as_objects: " << param.as_objects << ",\n"
     << "  as_arrays: " << param.as_arrays << ",\n"
     << "  batch_size: " << param.batch_size << "\n"
     << "}";
  return os;
}

}  // namespace mssql