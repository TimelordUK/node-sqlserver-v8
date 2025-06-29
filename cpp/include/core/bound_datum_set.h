#pragma once
// undo these tokens to use numeric_limits below
#undef min
#undef max

// Include platform.h first to ensure Windows types are defined
#include <platform.h>

// Then include ODBC headers which need the Windows types
#include <common/odbc_common.h>
#include <odbc/odbc_driver_types.h>

// Standard library includes
#include <limits>
#include <vector>
#include <string.h>
#include <memory>
#include <stdexcept>
#include <type_traits>
#include <string>
#include <iostream>
#include <sstream>
#include <iomanip>
#include <Logger.h>
#include <algorithm>
#include <napi.h>
#include <core/bound_datum.h>

#ifdef LINUX_BUILD
#include <cmath>
#include <cfloat>
#endif
#include "bound_datum_helper.h"

namespace mssql {
class QueryResult;
class QueryOperationParams;

class BoundDatumSet {
 public:
  typedef std::vector<std::shared_ptr<BoundDatum>> param_bindings;
  BoundDatumSet();
  BoundDatumSet(std::shared_ptr<QueryOperationParams> params);
  bool reserve(const std::vector<ColumnDefinition>& set, size_t row_count) const;
  bool bind(const Napi::Array& node_params);
  Napi::Array unbind(Napi::Env& env) const;
  void clear() {
    _bindings->clear();
  }
  size_t size() {
    return _bindings->size();
  }
  std::shared_ptr<BoundDatum>& atIndex(int i) {
    return (*_bindings)[i];
  }
  param_bindings::iterator begin() {
    return _bindings->begin();
  }
  param_bindings::iterator end() {
    return _bindings->end();
  }
  param_bindings::const_iterator begin() const {
    return _bindings->begin();
  }
  param_bindings::const_iterator end() const {
    return _bindings->end();
  }
  param_bindings::const_iterator cbegin() const {
    return _bindings->cbegin();
  }
  param_bindings::const_iterator cend() const {
    return _bindings->cend();
  }

  char* err;
  uint32_t first_error;

 private:
  bool tvp(Napi::Object& v) const;
  int _output_param_count;
  std::shared_ptr<param_bindings> _bindings;
  std::shared_ptr<QueryOperationParams> _params;
};
}  // namespace mssql
