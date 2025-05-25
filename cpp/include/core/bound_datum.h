#pragma once
// undo these tokens to use numeric_limits below
#undef min
#undef max

// Include platform.h first to ensure Windows types are defined
#include <platform.h>

// Then include ODBC headers which need the Windows types
#include <common/odbc_common.h>

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

#ifdef LINUX_BUILD
#include <cmath>
#include <cfloat>
#endif
#include "bound_datum_helper.h"

namespace mssql {
using namespace std;
class QueryOperationParams;

class BoundDatum {
 public:
  bool bind(const Napi::Object& p);
  void reserve_column_type(SQLSMALLINT type, size_t& len, const size_t row_count);

  bool get_defined_precision() const {
    return definedPrecision;
  }

  bool get_defined_scale() const {
    return definedScale;
  }

  Napi::Value unbind(const Napi::Env& env) const;

  vector<SQLLEN>& get_ind_vec() {
    return _indvec;
  }

  char* getErr() const {
    return err;
  }

  shared_ptr<DatumStorageLegacy> get_storage() {
    return _storage;
  }

  BoundDatum()
      : js_type(JS_UNKNOWN),
        c_type(0),
        sql_type(0),
        param_size(0),
        max_length(0),
        digits(0),
        buffer(nullptr),
        buffer_len(0),
        param_type(SQL_PARAM_INPUT),
        offset(0),
        is_bcp(false),
        ordinal_position(0),
        bcp_terminator_len(0),
        bcp_terminator(NULL),
        is_tvp(false),
        is_money(false),
        tvp_no_cols(0),
        definedPrecision(false),
        definedScale(false),
        err(nullptr) {
    _indvec = vector<SQLLEN>(1);
    _storage = make_shared<DatumStorageLegacy>();
    _params = nullptr;
  }

  BoundDatum(shared_ptr<QueryOperationParams> params) : BoundDatum() {
    _params = params;
  }

  enum JS_TYPE {

    JS_UNKNOWN,
    JS_NULL,
    JS_STRING,
    JS_BOOLEAN,
    JS_INT,
    JS_UINT,
    JS_NUMBER,
    JS_DATE,
    JS_BUFFER
  };

  JS_TYPE js_type;
  SQLSMALLINT c_type;
  SQLSMALLINT sql_type;
  SQLULEN param_size;
  SQLULEN max_length;
  SQLSMALLINT digits;
  SQLPOINTER buffer;
  SQLLEN buffer_len;
  uint16_t param_type;
  int32_t offset;
  bool is_bcp;
  int32_t bcp_version;
  uint32_t ordinal_position;
  SQLULEN bcp_terminator_len;
  LPCBYTE bcp_terminator;

  bool is_tvp;
  bool is_money;
  int tvp_no_cols;
  wstring name;

 private:
  vector<SQLLEN> _indvec;
  shared_ptr<DatumStorageLegacy> _storage;
  shared_ptr<QueryOperationParams> _params;
  bool definedPrecision;
  bool definedScale;

  char* err;

  void bind_null(const Napi::Object& p);
  void bind_null_array(const Napi::Object& p);
  void reserve_null(SQLLEN len);

  void bind_long_var_binary(const Napi::Object& p);

  void bind_w_long_var_char(const Napi::Object& p);
  void bind_w_var_char(const Napi::Object& p);
  void bind_w_var_char(const Napi::Object& p, int precision);
  void reserve_w_var_char_array(size_t max_str_len, size_t array_len);
  void bind_w_var_char_array(const Napi::Object& p);
  void bind_w_var_char_array_bcp(const Napi::Object& p);

  void bind_boolean(const Napi::Object& p);
  void reserve_boolean(SQLLEN len);
  void bind_boolean_array(const Napi::Object& p);

  void bind_small_int(const Napi::Object& p);
  void bind_tiny_int(const Napi::Object& p);

  void bind_numeric(const Napi::Object& p);
  void bind_numeric_struct(double d, SQL_NUMERIC_STRUCT& ns);
  void bind_numeric_array(const Napi::Object& p);
  void reserve_numeric(SQLLEN len);

  void bind_int8(const Napi::Object& p);
  void reserve_int8(SQLLEN len);
  void bind_int8_array(const Napi::Object& p);

  void bind_int16(const Napi::Object& p);
  void reserve_int16(SQLLEN len);
  void bind_int16_array(const Napi::Object& p);

  void bind_int32(const Napi::Object& p);
  void reserve_int32(SQLLEN len);
  void bind_int32_array(const Napi::Object& p);

  void bind_uint32(const Napi::Object& p);
  void reserve_uint32(SQLLEN len);
  void bind_uint32_array(const Napi::Object& p);

  void bind_integer(const Napi::Object& p);
  void reserve_integer(SQLLEN len);
  void bind_integer_array(const Napi::Object& p);

  void reserve_big_integer(SQLLEN len);

  void bind_float(const Napi::Object& p);
  void bind_real(const Napi::Object& p);

  void bind_decimal(const Napi::Object& p);
  void reserve_decimal(SQLLEN len);
  void bind_decimal_array(const Napi::Object& p);

  void bind_double(const Napi::Object& p);
  void reserve_double(SQLLEN len);
  void bind_double_array(const Napi::Object& p);

  void bind_time(const Napi::Object& p);
  void bind_time_array(const Napi::Object& p);
  void reserve_time(SQLLEN len);

  void bind_date(const Napi::Object& p);
  void bind_date_array(const Napi::Object& p);
  void reserve_date(SQLLEN len);

  void bind_time_stamp(const Napi::Object& p);
  void bind_time_stamp_array(const Napi::Object& p);
  void reserve_time_stamp(SQLLEN len);

  void bind_time_stamp_offset(const Napi::Object& p);
  void reserve_time_stamp_offset(SQLLEN len);
  void bind_time_stamp_offset_array(const Napi::Object& p);

  void bind_number(const Napi::Object& p);
  void bind_number_array(const Napi::Object& p);

  void bind_tvp(const Napi::Object& p);

  void bind_binary(const Napi::Object& p);
  void bind_binary_array(const Napi::Object& p);
  void bind_binary_array_bcp(const Napi::Object& p);
  void reserve_binary_array(size_t max_obj_len, size_t array_len);

  void bind_var_binary(const Napi::Object& p);
  void bind_var_binary_array(const Napi::Object& p);
  void bind_var_binary_array_bcp(const Napi::Object& p);
  void reserve_var_binary_array(size_t max_obj_len, size_t array_len);

  bool bind_datum_type(const Napi::Object& p);
  bool bind(Napi::Object o, const char* if_str, uint16_t type);
  bool bind_object(const Napi::Object& p);
  bool bind_array(const Napi::Object& pp);

  bool proc_bind(const Napi::Env& env, const Napi::Object& p, const Napi::Object& v);
  void bind_char(const Napi::Object& pp);
  void bind_var_char(const Napi::Object& p);
  void bind_var_char_array_bcp(const Napi::Object& p);
  void bind_var_char_array(const Napi::Object& p);
  void bind_var_char(const Napi::Object& p, int precision);
  void reserve_var_char_array(size_t precision, size_t array_len);
  bool user_bind(const Napi::Object& p, const Napi::Object& v);
  void assign_precision(Napi::Object& pv);

  void sql_longvarbinary(const Napi::Object pp);
  void sql_integer(const Napi::Object pp);
  void sql_wvarchar(const Napi::Object pp);
  void sql_wlongvarchar(const Napi::Object pp);
  void sql_bit(const Napi::Object pp);
  void sql_bigint(const Napi::Object pp);
  void sql_double(const Napi::Object pp);
  void sql_float(const Napi::Object pp);
  void sql_real(const Napi::Object pp);
  void sql_tinyint(const Napi::Object pp);
  void sql_smallint(const Napi::Object pp);
  void sql_decimal(const Napi::Object pp);
  void sql_numeric(const Napi::Object pp);
  void sql_char(const Napi::Object pp);
  void sql_varchar(const Napi::Object pp);
  void sql_ss_time2(const Napi::Object pp);
  void sql_type_date(const Napi::Object pp);
  void sql_type_timestamp(const Napi::Object pp);
  void sql_ss_timestampoffset(const Napi::Object pp);
  void sql_varbinary(const Napi::Object pp);
  void sql_binary(const Napi::Object pp);
  size_t get_default_size(size_t len) const;

  const Napi::Object unbind_null(const Napi::Env& env) const;
  const Napi::String unbind_string(const Napi::Env& env) const;
  const Napi::Number unbind_double(const Napi::Env& env) const;
  const Napi::Boolean unbind_boolean(const Napi::Env& env) const;
  const Napi::Number unbind_int32(const Napi::Env& env) const;
  const Napi::Number unbind_uint32(const Napi::Env& env) const;
  const Napi::Number unbind_number(const Napi::Env& env) const;
  const Napi::Date unbind_date(const Napi::Env& env) const;
};
}  // namespace mssql
