#pragma once

#include <platform.h>
#include <common/odbc_common.h>
#include <vector>
#include <odbc/odbc_driver_types.h>
#include <js/columns/column.h>
#include <napi.h>

namespace mssql {

class ResultSet {
 public:
  typedef vector<shared_ptr<Column>> t_row;

  ResultSet(int num_columns) : _row_count(0), _end_of_rows(true), _end_of_results(false) {
    _metadata.resize(num_columns);
  }

  std::vector<ColumnDefinition> get_metadata() const {
    return _metadata;
  }

  ColumnDefinition& get_meta_data(int column) {
    return _metadata[column];
  }

  size_t get_column_count() const {
    return _metadata.size();
  }

  void start_results() {
    _rows.clear();
    _end_of_rows = false;
    _end_of_results = false;
  }

  Napi::Array meta_to_value(Napi::Env env);
  void add_column(size_t row_id, const shared_ptr<Column>& column);
  Napi::Object get_entry(Napi::Env env, const ColumnDefinition& definition);
  shared_ptr<Column> get_column(size_t row_id, size_t id) const;
  size_t get_result_count() const {
    return _rows.size();
  }

  SQLLEN row_count() const {
    return _row_count;
  }

  bool EndOfRows() const {
    return _end_of_rows;
  }

  bool EndOfResults() const {
    return _end_of_results;
  }

 private:
  Napi::Object get_entry(const ColumnDefinition& definition);
  std::vector<ColumnDefinition> _metadata;

  SQLLEN _row_count;
  bool _end_of_rows;
  bool _end_of_results;
  std::vector<t_row> _rows;

  friend class OdbcStatementLegacy;
};
}  // namespace mssql
