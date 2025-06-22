#include <core/bound_datum.h>
#include <core/bound_datum_helper.h>
#include <js/js_object_mapper.h>
#include <common/time_utils.h>
#include <common/numeric_utils.h>
#include <common/string_utils.h>
#include <core/bound_datum_set.h>
#include <odbc/odbc_driver_types.h>
#include <cstring>
#include <string>
#include <ctime>
#include <utility>
#include <napi.h>

namespace mssql {
BoundDatumSet::BoundDatumSet()
    : err(nullptr), first_error(0), _output_param_count(-1), _params(nullptr) {
  _bindings = make_shared<param_bindings>();
}

BoundDatumSet::BoundDatumSet(std::shared_ptr<QueryOperationParams> params) : BoundDatumSet() {
  _params = std::move(params);
}

bool BoundDatumSet::reserve(const std::vector<ColumnDefinition>& set,
                            const size_t row_count) const {
  for (uint32_t i = 0; i < set.size(); ++i) {
    const auto binding = make_shared<BoundDatum>(_params);
    const auto& def = set[i];
    const size_t size = def.columnSize;
    size_t new_size = size;
    binding->reserve_column_type(def.dataType, new_size, row_count);
    // Note: If column size needs updating, it should be done through a non-const method
    // For now, we just use the new_size in the binding
    _bindings->push_back(binding);
  }
  return true;
}

Napi::Value get(const Napi::Object& o, const char* v) {
  return o.Get(v);
}

int get_tvp_col_count(const Napi::Object& v) {
  const auto tvp_columns = v.Get("table_value_param");
  const auto cols = tvp_columns.As<Napi::Array>();
  const auto count = cols.Length();
  return count;
}

bool BoundDatumSet::tvp(Napi::Object& v) const {
  const auto tvp_columns = v.Get("table_value_param").As<Napi::Object>();
  if (tvp_columns.IsNull())
    return false;
  if (!tvp_columns.IsArray())
    return false;

  const auto cols = tvp_columns.As<Napi::Array>();
  const auto count = cols.Length();

  for (uint32_t i = 0; i < count; ++i) {
    const auto binding = make_shared<BoundDatum>();
    auto p = tvp_columns[i].As<Napi::Object>();
    const auto res = binding->bind(p);
    if (!res)
      break;
    _bindings->push_back(binding);
  }
  return true;
}

bool BoundDatumSet::bind(const Napi::Array& node_params) {
  const auto count = node_params.Length();
  auto res = true;
  _output_param_count = 0;
  if (count > 0) {
    for (uint32_t i = 0; i < count; ++i) {
      const auto binding = make_shared<BoundDatum>();
      Napi::Value elem = node_params[static_cast<uint32_t>(i)];
      Napi::Object v = elem.As<Napi::Object>();
      res = binding->bind(v);

      switch (binding->param_type) {
        case SQL_PARAM_OUTPUT:
        case SQL_PARAM_INPUT_OUTPUT:
          _output_param_count++;
          break;

        default:
          break;
      }

      if (!res) {
        err = binding->getErr();
        first_error = i;
        break;
      }

      _bindings->push_back(binding);

      if (binding->is_tvp) {
        const auto col_count = get_tvp_col_count(v);
        binding->tvp_no_cols = col_count;
        res = tvp(v);
      }
    }
  }

  return res;
}

Napi::Array BoundDatumSet::unbind(Napi::Env& env) const {
  auto arr = Napi::Array::New(env, _output_param_count);
  auto i = 0;

  std::for_each(
      _bindings->begin(), _bindings->end(), [&](const shared_ptr<BoundDatum>& param) mutable {
        switch (param->param_type) {
          case SQL_PARAM_OUTPUT:
          case SQL_PARAM_INPUT_OUTPUT: {
            const auto v = param->unbind(env);
            arr.Set(static_cast<uint32_t>(i++), v);
          } break;

          default:
            break;
        }
      });
  return arr;
}
}  // namespace mssql
