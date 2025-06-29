#include <platform.h>
#include <common/odbc_common.h>
#include <js/columns/result_set.h>
#include <napi.h>
#include <js/js_object_mapper.h>

namespace mssql {

shared_ptr<Column> ResultSet::get_column(const size_t row_id, const size_t column_id) const {
  if (row_id >= _rows.size()) {
    return nullptr;
  }
  const auto& row = _rows[row_id];
  return row[column_id];
}

void ResultSet::add_column(const size_t row_id, const shared_ptr<Column>& column) {
  if (_rows.size() < row_id + 1) {
    _rows.resize(row_id + 1);
  }
  auto& row = _rows[row_id];
  if (row.size() != _metadata.size()) {
    row.resize(_metadata.size());
  }
  row[column->Id()] = column;
}

Napi::Object ResultSet::get_entry(Napi::Env env, const ColumnDefinition& definition) {
  return JsObjectMapper::fromColumnDefinition(env, definition);
}

Napi::Array ResultSet::meta_to_value(Napi::Env env) {
  Napi::Array metadata = Napi::Array::New(env, this->_metadata.size());

  for_each(this->_metadata.begin(),
           this->_metadata.end(),
           [&metadata, env, this](const ColumnDefinition& definition) {
             metadata.Set(metadata.Length(), get_entry(env, definition));
           });

  return metadata;
}
}  // namespace mssql
