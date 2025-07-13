#include <core/bound_datum.h>
#include <common/odbc_common.h>
#include <core/bound_datum_helper.h>
#include <js/js_object_mapper.h>
#include <common/time_utils.h>
#include <common/numeric_utils.h>
#include <common/string_utils.h>
#include <cstring>
#include <string>
#include <ctime>

namespace mssql {
constexpr int sql_server_2008_default_time_precision = 16;
constexpr int sql_server_2008_default_datetime_precision = 34;
constexpr int sql_server_2008_default_timestamp_precision = 27;
constexpr int sql_server_2008_default_datetime_scale = 7;

static bool get_as_bool(const Napi::Object& o, const char* v) {
  if (o.IsNull() || o.IsUndefined()) {
    return false;
  }

  auto val = o.Get(v);
  if (val.IsBoolean()) {
    return val.As<Napi::Boolean>().Value();
  }

  return false;
}

bool sql_type_s_maps_to_tvp(const Napi::Object& p) {
  if (p.IsNull() || p.IsUndefined()) {
    return false;
  }
  return get_as_bool(p, "is_user_defined");
}

bool BoundDatum::bind(const Napi::Object& p) {
  auto res = false;
  if (sql_type_s_maps_to_tvp(p)) {
    bind_tvp(p);
    return true;
  }
  if (p.IsArray()) {
    res = bind_array(p);
  } else if (p.IsObject()) {
    res = bind_object(p);
  }
  if (!res)
    res = bind_datum_type(p);
  return res;
}

static Napi::String get_as_string(const Napi::Object& o, const char* v) {
  auto val = o.Get(v);
  if (val.IsString()) {
    return val.As<Napi::String>();
  }
  // Return empty string if not found or not a string
  return Napi::String::New(o.Env(), "");
}

void BoundDatum::bind_null(const Napi::Object& p) {
  reserve_null(1);
  _indvec[0] = SQL_NULL_DATA;
}

void BoundDatum::bind_null_array(const Napi::Object& p) {
  const auto arr = p.As<Napi::Array>();
  const auto len = arr.Length();
  reserve_null(len);
  for (uint32_t i = 0; i < len; ++i) {
    _indvec[i] = SQL_NULL_DATA;
  }
}

void BoundDatum::reserve_null(const SQLLEN len) {
  buffer_len = 0;
  _indvec.resize(len);
  js_type = JS_NULL;

  // Only set default types if not already set
  if (c_type == 0) {
    c_type = SQL_C_CHAR;
  }
  if (sql_type == 0) {
    sql_type = SQL_CHAR;
  }

  // For binary types, use appropriate C type
  switch (sql_type) {
    case SQL_BINARY:
    case SQL_VARBINARY:
    case SQL_LONGVARBINARY:
      c_type = SQL_C_BINARY;
      break;
  }

  param_size = 1;
  digits = 0;
  buffer = nullptr;
}

void BoundDatum::bind_w_long_var_char(const Napi::Object& p) {
  bind_w_var_char(p);
  sql_type = SQL_WLONGVARCHAR;
}

void BoundDatum::bind_w_var_char(const Napi::Object& p) {
  if (p.IsString()) {
    const auto str_param = p.As<Napi::String>();
    const auto utf16_str = str_param.Utf16Value();
    const auto length = utf16_str.length();
    bind_w_var_char(p, length);
  } else {
    bind_w_var_char(p, 0);
  }
}

void BoundDatum::bind_char(const Napi::Object& p) {
  bind_var_char(p);
  sql_type = SQL_CHAR;
}

void BoundDatum::bind_var_char(const Napi::Object& p) {
  SQLULEN precision = 0;
  if (p.IsString()) {
    const auto local = p.As<Napi::String>();
    precision = local.Utf8Value().length();
  }
  if (param_size > 0)
    precision = min(param_size, precision);
  bind_var_char(p, static_cast<int>(precision));
}

void BoundDatum::reserve_var_char_array(const size_t max_str_len, const size_t array_len) {
  js_type = JS_STRING;
  c_type = SQL_C_CHAR;
  sql_type = max_str_len > 8000 ? SQL_WLONGVARCHAR : SQL_VARCHAR;
  if (max_str_len == 4000) {
    sql_type = SQL_WCHAR;
  }
  digits = 0;
  _indvec.resize(array_len);
  _storage->ReserveChars(max(1, static_cast<int>(array_len * max_str_len)));
  auto* itr_p = _storage->charvec_ptr->data();
  buffer = itr_p;
  buffer_len = static_cast<SQLLEN>(max_str_len);
  if (param_size <= 0) {
    if (max_str_len >= 4000) {
      param_size = 0;
    } else {
      param_size = max(buffer_len, static_cast<SQLLEN>(1));
    }
  }
}

void BoundDatum::bind_var_char(const Napi::Object& p, const int precision) {
  reserve_var_char_array(precision, 1);
  _indvec[0] = SQL_NULL_DATA;
  if (!p.IsNull() && !p.IsUndefined() && p.IsString()) {
    const auto str_param = p.As<Napi::String>();
    std::string utf8_str = str_param.Utf8Value();
    const auto copy_len = min(static_cast<size_t>(precision), utf8_str.length());
    memcpy(_storage->charvec_ptr->data(), utf8_str.c_str(), copy_len);
    _indvec[0] = copy_len;
  }
}

int get_max_str_len(const Napi::Object& p) {
  size_t str_len = 0;
  const auto arr = p.As<Napi::Array>();
  const auto len = arr.Length();
  for (uint32_t i = 0; i < len; ++i) {
    auto elem = arr[i];
    if (elem.IsNull() || elem.IsUndefined())
      continue;
    if (!elem.IsString())
      continue;
    const auto str = elem.As<Napi::String>().Utf16Value();
    if (str.size() > str_len) {
      str_len = str.size();
    }
  }
  return static_cast<int>(str_len);
}

void BoundDatum::bind_var_char_array_bcp(const Napi::Object& p) {
  const auto arr = p.As<Napi::Array>();
  const auto array_len = arr.Length();
  _storage->ReserveCharVec(array_len);
  _indvec.resize(array_len);
  sql_type = SQLVARCHAR;
  param_size = SQL_VARLEN_DATA;
  buffer_len = get_max_str_len(p);
  auto& vec = *_storage->char_vec_vec_ptr;
  for (uint32_t i = 0; i < array_len; ++i) {
    _indvec[i] = SQL_NULL_DATA;
    auto elem = arr[i];
    if (elem.IsNull() || elem.IsUndefined())
      continue;

    if (!elem.IsString())
      continue;

    const auto str = elem.As<Napi::String>();
    std::string utf8_str = str.Utf8Value();
    const auto width = utf8_str.length();
    _indvec[i] = width;

    const auto store = make_shared<DatumStorageLegacy::char_vec_t>(width);
    store->reserve(width);
    store->resize(width);
    vec[i] = store;
    const auto itr = store->data();
    memcpy(&*itr, utf8_str.c_str(), width);
  }
}

void BoundDatum::bind_var_char_array(const Napi::Object& p) {
  if (is_bcp) {
    bind_var_char_array_bcp(p);
    return;
  }
  const auto max_str_len = max(1, get_max_str_len(p));
  const auto arr = p.As<Napi::Array>();
  const auto array_len = arr.Length();
  reserve_var_char_array(max_str_len, array_len);
  auto* const base = _storage->charvec_ptr->data();
  for (uint32_t i = 0; i < array_len; ++i) {
    auto* const itr = base + (max_str_len * i);
    _indvec[i] = SQL_NULL_DATA;
    const auto elem = arr[i];
    if (elem.IsNull() || elem.IsUndefined())
      continue;
    const auto str = elem.As<Napi::String>().Utf8Value();
    const auto width = str.size();
    _indvec[i] = width;
    memcpy(&*itr, str.c_str(), width);
  }
}

void BoundDatum::reserve_w_var_char_array(const size_t max_str_len, const size_t array_len) {
  js_type = JS_STRING;
  c_type = SQL_C_WCHAR;
  sql_type = max_str_len > 4000 ? SQL_WLONGVARCHAR : SQL_WVARCHAR;
  constexpr auto size = sizeof(uint16_t);
  _indvec.resize(array_len);
  _storage->ReserveUint16(array_len * max_str_len);
  buffer = _storage->uint16vec_ptr->data();
  buffer_len = static_cast<SQLLEN>(max_str_len * size);
  if (max_length > 0) {
    param_size = max_length / 2;
  } else if (param_size <= 0) {
    if (max_str_len > 4000) {
      // For WLongVarChar (NVARCHAR(MAX)), use the actual string length
      param_size = max_str_len;
    } else {
      param_size = max(buffer_len / 2, static_cast<SQLLEN>(1));
    }
  }
}

void BoundDatum::bind_w_var_char_array_bcp(const Napi::Object& p) {
  const auto arr = p.As<Napi::Array>();
  const auto array_len = arr.Length();
  _storage->ReserveUint16Vec(array_len);
  _indvec.resize(array_len);
  sql_type = SQLNCHAR;
  param_size = SQL_VARLEN_DATA;
  buffer_len = get_max_str_len(p) + 1;
  bcp_terminator = reinterpret_cast<LPCBYTE>(L"");
  bcp_terminator_len = sizeof(WCHAR);
  auto& vec = *_storage->uint16_vec_vec_ptr;
  for (uint32_t i = 0; i < array_len; ++i) {
    _indvec[i] = SQL_NULL_DATA;
    auto elem = arr[i];
    if (elem.IsNull() || elem.IsUndefined())
      continue;

    if (!elem.IsString())
      continue;

    const auto str = elem.As<Napi::String>();
    const auto utf16_str = str.Utf16Value();
    const auto len = utf16_str.size();
    constexpr auto size = sizeof(uint16_t);
    const auto store = make_shared<DatumStorageLegacy::uint16_t_vec_t>(len);
    store->reserve(len);
    store->resize(len);
    vec[i] = store;
    const auto itr = store->data();
    const auto width = len * size;
    _indvec[i] = static_cast<SQLLEN>(width);
    // Copy UTF-16 data
    memcpy(itr, utf16_str.c_str(), width);
    store->push_back(0);
  }
}

void BoundDatum::bind_w_var_char_array(const Napi::Object& p) {
  if (is_bcp) {
    bind_w_var_char_array_bcp(p);
    return;
  }
  const auto max_str_len = max(1, get_max_str_len(p));
  const auto arr = p.As<Napi::Array>();
  const auto array_len = arr.Length();
  reserve_w_var_char_array(max_str_len, array_len);
  auto* const base = _storage->uint16vec_ptr->data();
  for (uint32_t i = 0; i < array_len; ++i) {
    constexpr auto size = sizeof(uint16_t);
    auto* const itr = base + static_cast<SQLLEN>(max_str_len) * i;
    _indvec[i] = SQL_NULL_DATA;
    const auto elem = arr[i];
    if (elem.IsNull() || elem.IsUndefined())
      continue;
    const auto str = elem.As<Napi::String>().Utf16Value();
    const auto width = str.size() * size;
    _indvec[i] = static_cast<SQLLEN>(width);
    // Copy UTF-16 data
    memcpy(itr, str.c_str(), width);
  }
}

void BoundDatum::bind_w_var_char(const Napi::Object& p, const int precision) {
  // Note: We need to allocate buffer space for null terminator, but param_size should not include
  // it
  const size_t buffer_size = max(1, precision);  // Buffer needs space for null terminator
  reserve_w_var_char_array(buffer_size, 1);

  _indvec[0] = SQL_NULL_DATA;
  if (!p.IsNull() && !p.IsUndefined() && p.IsString()) {
    constexpr auto size = sizeof(uint16_t);
    const auto str_param = p.As<Napi::String>();
    const auto utf16_str = str_param.Utf16Value();
    auto* const first_p = _storage->uint16vec_ptr->data();
    const auto copy_len = min(utf16_str.size(), static_cast<size_t>(precision));
    memcpy(first_p, utf16_str.c_str(), copy_len * size);
    buffer_len = static_cast<SQLLEN>(precision) * static_cast<SQLLEN>(size);
    _indvec[0] = buffer_len;
  }
}

size_t get_max_object_len(const Napi::Object& p) {
  size_t obj_len = 0;
  const auto arr = p.As<Napi::Array>();
  const auto len = arr.Length();
  for (uint32_t i = 0; i < len; ++i) {
    auto elem = arr[i];
    if (elem.IsNull() || elem.IsUndefined())
      continue;
    if (!elem.IsBuffer())
      continue;
    const auto buffer = elem.As<Napi::Buffer<uint8_t>>();
    const auto width = buffer.Length();
    if (width > obj_len)
      obj_len = width;
  }
  return obj_len;
}

void BoundDatum::bind_long_var_binary(const Napi::Object& p) {
  bind_var_binary(p);
  sql_type = SQL_LONGVARBINARY;
}

void BoundDatum::reserve_binary_array(const size_t max_obj_len, const size_t array_len) {
  js_type = JS_BUFFER;
  c_type = SQL_C_BINARY;
  sql_type = SQL_BINARY;
  digits = 0;
  constexpr auto size = sizeof(uint8_t);
  _storage->ReserveChars(array_len * max_obj_len);
  _indvec.resize(array_len);
  buffer = _storage->charvec_ptr->data();
  buffer_len = static_cast<SQLLEN>(max_obj_len) * static_cast<SQLLEN>(size);
  param_size = max_obj_len;
}

void BoundDatum::reserve_var_binary_array(const size_t max_obj_len, const size_t array_len) {
  js_type = JS_BUFFER;
  c_type = SQL_C_BINARY;
  sql_type = max_obj_len > 2000 ? SQL_LONGVARBINARY : SQL_VARBINARY;
  digits = 0;
  constexpr auto size = sizeof(uint8_t);
  _storage->ReserveChars(array_len * max_obj_len);
  _indvec.resize(array_len);
  buffer = _storage->charvec_ptr->data();
  buffer_len = static_cast<SQLLEN>(max_obj_len) * static_cast<SQLLEN>(size);
  param_size = max_obj_len;
}

/*
 *const auto r = SQLBindParameter(*_statement, current_param, datum.param_type, datum.c_type,
 datum.sql_type, datum.param_size, datum.digits, datum.buffer, datum.buffer_len,
 datum.get_ind_vec().data());


                  retcode = SQLBindParameter(
                  hstmt,              // Statement handle
      current_param		1,                  // Parameter Number
      param_type			SQL_PARAM_INPUT,    // Input/Output Type (always INPUT for TVP)
      c_type				SQL_C_DEFAULT,      // C - Type (always this for a TVP)
      sql_type			SQL_SS_TABLE,       // SQL Type (always this for a TVP)
      param_size			MAX_ARRAY_SIZE,     // For a TVP this is max rows we will use
      digits				0,                  // For a TVP this is always 0
      buffer				TVPTableName,       // For a TVP this is the type name of the
                  // TVP, and also a token returned by
                  // SQLParamData.
      buffer_len			SQL_NTS,            // For a TVP this is the length of the type
                  // name or SQL_NTS.
                  &lTVPRowsUsed);     // For a TVP this is the number of rows
                  // actually available.
 */

static int get_row_count(const Napi::Object& p) {
  auto rows = 1;
  if (!p.IsObject())
    return -1;

  const auto row_count = p.Get("row_count");
  if (row_count.IsNull() || row_count.IsUndefined())
    return rows;

  if (row_count.IsNumber()) {
    rows = row_count.ToNumber().Int32Value();
  }
  return rows;
}

wstring wide_from_js_string(const Napi::String& s) {
  const auto utf8 = s.Utf8Value();
  // Convert UTF-8 to UTF-16 using StringUtils
  auto u16str = StringUtils::Utf8ToU16String(utf8);

  // Convert u16string to wstring
  wstring result;
  result.reserve(u16str.size());
  for (auto ch : u16str) {
    result.push_back(static_cast<wchar_t>(ch));
  }
  return result;
}

void BoundDatum::bind_tvp(const Napi::Object& p) {
  // fprintf(stderr, "bind tvp\n");
  is_tvp = true;
  param_type = SQL_PARAM_INPUT;
  c_type = SQL_C_DEFAULT;
  sql_type = SQL_SS_TABLE;
  const auto rows = get_row_count(p);
  const auto type_id_str = get_as_string(p, "type_id");
  const auto schema_str = get_as_string(p, "schema");

  if (!schema_str.IsNull() && !schema_str.IsUndefined() && schema_str.Utf16Value().length() > 0) {
    _storage->schema = wide_from_js_string(schema_str);
  }
  _indvec.resize(1);
  const size_t precision = type_id_str.Utf16Value().length();
  _storage->ReserveChars(precision + 1);
  _storage->ReserveUint16(precision + 1);
  auto* itr_p = _storage->charvec_ptr->data();

  // Get UTF8 string from N-API
  std::string utf8_str = type_id_str.Utf8Value();
  memcpy(itr_p, utf8_str.c_str(), precision);

  // Convert UTF8 to wide string using StringUtils
  const string narrow = _storage->charvec_ptr->data();
  auto u16str = StringUtils::Utf8ToU16String(narrow);
  wstring type_name;
  type_name.reserve(u16str.size());
  for (auto ch : u16str) {
    type_name.push_back(static_cast<wchar_t>(ch));
  }
  const auto type_name_vec = odbcstr::wstr2wcvec(type_name);
  constexpr auto size = sizeof(type_name_vec[0]);
  memcpy(_storage->uint16vec_ptr->data(), type_name_vec.data(), precision * size);
  buffer = _storage->uint16vec_ptr->data();
  buffer_len = static_cast<SQLLEN>(precision) * static_cast<SQLLEN>(size);
  param_size = rows;  // max no of rows.
  _indvec[0] = rows;  // no of rows.
  digits = 0;
}

void BoundDatum::bind_binary(const Napi::Object& p) {
  _indvec[0] = SQL_NULL_DATA;
  const auto valid = !p.IsNull() && !p.IsUndefined() && p.IsBuffer();
  const auto obj_len = valid ? p.As<Napi::Buffer<uint8_t>>().Length() : 0;
  reserve_binary_array(obj_len, 1);

  if (valid) {
    const auto itr = _storage->charvec_ptr->begin();
    const auto buffer = p.As<Napi::Buffer<uint8_t>>();
    const auto* const ptr = buffer.Data();
    _indvec[0] = static_cast<SQLLEN>(obj_len);
    memcpy(&*itr, ptr, obj_len);
  }
}

void BoundDatum::bind_var_binary(const Napi::Object& p) {
  _indvec[0] = SQL_NULL_DATA;
  const auto valid = !p.IsNull() && !p.IsUndefined() && p.IsBuffer();
  const auto obj_len = valid ? p.As<Napi::Buffer<uint8_t>>().Length() : 0;
  reserve_var_binary_array(obj_len, 1);

  if (valid) {
    const auto itr = _storage->charvec_ptr->begin();
    const auto buffer = p.As<Napi::Buffer<uint8_t>>();
    const auto* const ptr = buffer.Data();
    _indvec[0] = static_cast<SQLLEN>(obj_len);
    memcpy(&*itr, ptr, obj_len);
  }
}

void BoundDatum::bind_var_binary_array_bcp(const Napi::Object& p) {
  const auto arr = p.As<Napi::Array>();
  const auto array_len = arr.Length();
  _storage->ReserveCharVec(array_len);
  _indvec.resize(array_len);
  sql_type = SQLVARBINARY;
  param_size = SQL_VARLEN_DATA;
  buffer_len = static_cast<SQLLEN>(get_max_object_len(p));
  auto& vec = *_storage->char_vec_vec_ptr;
  for (uint32_t i = 0; i < array_len; ++i) {
    _indvec[i] = SQL_NULL_DATA;
    auto elem = arr[i];
    if (elem.IsNull() || elem.IsUndefined())
      continue;

    // Check if it's a Buffer
    if (!elem.IsBuffer())
      continue;

    const auto buffer = elem.As<Napi::Buffer<uint8_t>>();
    const auto* const ptr = buffer.Data();
    const auto obj_len = buffer.Length();

    _indvec[i] = static_cast<SQLLEN>(obj_len);
    const auto store = make_shared<DatumStorageLegacy::char_vec_t>(obj_len);
    store->reserve(obj_len);
    store->resize(obj_len);
    vec[i] = store;
    const auto itr = store->data();
    memcpy(&*itr, ptr, obj_len);
  }
}

void BoundDatum::bind_var_binary_array(const Napi::Object& p) {
  if (is_bcp) {
    bind_var_binary_array_bcp(p);
    return;
  }

  const auto arr = p.As<Napi::Array>();
  const auto array_len = arr.Length();
  const auto max_obj_len = get_max_object_len(p);
  reserve_var_binary_array(max_obj_len, array_len);
  auto* const base = _storage->charvec_ptr->data();

  for (uint32_t i = 0; i < array_len; ++i) {
    auto* const itr = base + (max_obj_len * i);
    _indvec[i] = SQL_NULL_DATA;
    const auto elem = arr[i];

    if (elem.IsNull() || elem.IsUndefined())
      continue;

    // Check if it's a Buffer
    if (!elem.IsBuffer())
      continue;

    const auto buffer = elem.As<Napi::Buffer<uint8_t>>();
    const auto* const ptr = buffer.Data();
    const auto obj_len = buffer.Length();

    _indvec[i] = static_cast<SQLLEN>(obj_len);
    memcpy(&*itr, ptr, obj_len);
  }
}
void BoundDatum::bind_boolean(const Napi::Object& p) {
  reserve_boolean(1);
  auto& vec = *_storage->charvec_ptr;
  _indvec[0] = SQL_NULL_DATA;
  if (!p.IsNull() && !p.IsUndefined()) {
    const auto v = p.As<Napi::Boolean>().Value();
    vec[0] = !v ? 0 : 1;
    _indvec[0] = 0;
  }
}

void BoundDatum::bind_boolean_array(const Napi::Object& p) {
  const auto arr = p.As<Napi::Array>();
  const auto len = arr.Length();
  reserve_boolean(len);
  auto& vec = *_storage->charvec_ptr;
  for (uint32_t i = 0; i < len; ++i) {
    _indvec[i] = SQL_NULL_DATA;
    const auto elem = arr[i];
    if (!elem.IsNull() && !elem.IsUndefined()) {
      const auto v = elem.As<Napi::Boolean>().Value();
      const auto b = !v ? 0 : 1;
      vec[i] = static_cast<char>(b);
      _indvec[i] = is_bcp ? sizeof(int8_t) : 0;
    }
  }
}

void BoundDatum::reserve_boolean(const SQLLEN len) {
  constexpr auto size = sizeof(char);
  buffer_len = static_cast<SQLLEN>(len) * static_cast<SQLLEN>(size);
  _storage->ReserveChars(len);
  _indvec.resize(len);
  js_type = JS_BOOLEAN;
  c_type = SQL_C_BIT;
  sql_type = SQL_BIT;
  buffer = _storage->charvec_ptr->data();
  param_size = size;
  digits = 0;
  if (is_bcp) {
    sql_type = SQLBIT;
    param_size = sizeof(DBBIT);
  }
}

double rescale(const double d, const int param_size, const int digits) {
  SQL_NUMERIC_STRUCT ns;
  double scale_d = d;
  NumericUtils::encode_numeric_struct(d, static_cast<int>(param_size), digits, ns);
  if (ns.scale < digits) {
    const double powers = pow(10, digits);
    scale_d *= powers;
  }
  return scale_d;
}

// if we are given 15 digits for say numeric(20,15) then
// if only provided 5, will have to multiply by full scale

void BoundDatum::bind_numeric_struct(double d, SQL_NUMERIC_STRUCT& ns) {
  if (digits > 0)
    d = rescale(d, param_size, digits);
  NumericUtils::encode_numeric_struct(d, static_cast<int>(param_size), digits, ns);
  if (param_size <= 0)
    param_size = ns.precision;
  if (digits <= 0)
    digits = static_cast<unsigned char>(ns.scale);
  else
    ns.scale = digits;
}

void BoundDatum::bind_numeric(const Napi::Object& p) {
  reserve_numeric(1);
  sql_type = SQL_NUMERIC;
  _indvec[0] = SQL_NULL_DATA;
  if (!p.IsNull() && !p.IsUndefined()) {
    const auto d = p.ToNumber().DoubleValue();
    auto& vec = *_storage->numeric_ptr;
    auto& ns = vec[0];
    bind_numeric_struct(d, ns);
    _indvec[0] = sizeof(SQL_NUMERIC_STRUCT);
  }
}

void BoundDatum::bind_numeric_array(const Napi::Object& p) {
  const auto arr = p.As<Napi::Array>();
  const int len = arr.Length();
  reserve_numeric(len);
  auto& vec = *_storage->numeric_ptr;
  for (auto i = 0; i < len; ++i) {
    auto& ns = vec[i];
    _indvec[i] = SQL_NULL_DATA;
    const auto elem = arr[i];
    if (!elem.IsNull() && !elem.IsUndefined()) {
      const auto d = elem.ToNumber().DoubleValue();
      bind_numeric_struct(d, ns);
      _indvec[i] = sizeof(SQL_NUMERIC_STRUCT);
    }
  }
}

void BoundDatum::reserve_numeric(const SQLLEN len) {
  definedPrecision = true;
  buffer_len = len * sizeof(SQL_NUMERIC_STRUCT);
  _storage->ReserveNumerics(len);
  _indvec.resize(len);
  js_type = JS_NUMBER;
  c_type = SQL_C_NUMERIC;
  sql_type = SQL_NUMERIC;
  buffer = _storage->numeric_ptr->data();
  if (is_bcp) {
    sql_type = SQLNUMERICN;
    param_size = sizeof(SQL_NUMERIC_STRUCT);
  }
}

void BoundDatum::bind_tiny_int(const Napi::Object& p) {
  bind_int8(p);
}

void BoundDatum::bind_small_int(const Napi::Object& p) {
  bind_int16(p);
}

void BoundDatum::bind_int8(const Napi::Object& p) {
  reserve_int8(1);
  _indvec[0] = SQL_NULL_DATA;
  auto& vec = *_storage->int8vec_ptr;
  vec[0] = SQL_NULL_DATA;
  if (!p.IsNull() && !p.IsUndefined()) {
    const auto d = p.ToNumber().Int32Value();
    vec[0] = d;
    _indvec[0] = 0;
  }
}

void BoundDatum::bind_int16(const Napi::Object& p) {
  reserve_int16(1);
  _indvec[0] = SQL_NULL_DATA;
  auto& vec = *_storage->int16vec_ptr;
  vec[0] = SQL_NULL_DATA;
  if (!p.IsNull() && !p.IsUndefined()) {
    const auto d = p.ToNumber().Int32Value();
    vec[0] = d;
    _indvec[0] = 0;
  }
}

void BoundDatum::bind_int32(const Napi::Object& p) {
  reserve_int32(1);
  _indvec[0] = SQL_NULL_DATA;
  auto& vec = *_storage->int32vec_ptr;
  vec[0] = SQL_NULL_DATA;
  if (!p.IsNull() && !p.IsUndefined()) {
    const auto d = p.ToNumber().Int32Value();
    vec[0] = d;
    _indvec[0] = 0;
  }
}

void BoundDatum::bind_int16_array(const Napi::Object& p) {
  const auto arr = p.As<Napi::Array>();
  const auto len = arr.Length();
  reserve_int16(len);
  auto& vec = *_storage->int16vec_ptr;

  for (unsigned int i = 0; i < len; ++i) {
    _indvec[i] = SQL_NULL_DATA;
    const auto elem = arr[i];
    if (!elem.IsNull() && !elem.IsUndefined()) {
      const auto v = elem.ToNumber().Int32Value();
      vec[i] = v;
      _indvec[i] = is_bcp ? sizeof(int16_t) : 0;
    }
  }
}

void BoundDatum::bind_int32_array(const Napi::Object& p) {
  const auto arr = p.As<Napi::Array>();
  const auto len = arr.Length();
  reserve_int32(len);
  auto& vec = *_storage->int32vec_ptr;

  for (unsigned int i = 0; i < len; ++i) {
    _indvec[i] = SQL_NULL_DATA;
    const auto elem = arr[i];
    if (!elem.IsNull() && !elem.IsUndefined()) {
      const auto v = elem.ToNumber().Int32Value();
      vec[i] = v;
      _indvec[i] = is_bcp ? sizeof(int32_t) : 0;
    }
  }
}

void BoundDatum::reserve_int8(const SQLLEN len) {
  constexpr auto size = sizeof(int8_t);
  buffer_len = len * static_cast<SQLLEN>(size);
  _storage->ReserveInt8(len);
  _indvec.resize(len);
  js_type = JS_INT;
  c_type = SQL_C_TINYINT;
  sql_type = SQL_TINYINT;
  buffer = _storage->int8vec_ptr->data();
  param_size = size;
  digits = 0;
  if (is_bcp) {
    sql_type = SQLINT1;
    param_size = size;
  }
}

void BoundDatum::reserve_int16(const SQLLEN len) {
  constexpr auto size = sizeof(int16_t);
  buffer_len = len * static_cast<SQLLEN>(size);
  _storage->ReserveInt16(len);
  _indvec.resize(len);
  js_type = JS_INT;
  c_type = SQL_C_SHORT;
  sql_type = SQL_SMALLINT;
  buffer = _storage->int16vec_ptr->data();
  param_size = size;
  digits = 0;
  if (is_bcp) {
    sql_type = SQLINT2;
    param_size = size;
  }
}

void BoundDatum::reserve_int32(const SQLLEN len) {
  constexpr auto size = sizeof(int32_t);
  buffer_len = len * static_cast<SQLLEN>(size);
  _storage->ReserveInt32(len);
  _indvec.resize(len);
  js_type = JS_INT;
  c_type = SQL_C_SLONG;
  sql_type = SQL_INTEGER;
  buffer = _storage->int32vec_ptr->data();
  param_size = size;
  digits = 0;
  if (is_bcp) {
    sql_type = SQLINT4;
    param_size = size;
  }
}

void BoundDatum::bind_uint32(const Napi::Object& p) {
  reserve_uint32(1);
  auto& vec = *_storage->uint32vec_ptr;
  _indvec[0] = SQL_NULL_DATA;
  if (!p.IsNull() && !p.IsUndefined()) {
    const auto v = p.ToNumber().Uint32Value();
    vec[0] = v;
    _indvec[0] = 0;
  }
}

void BoundDatum::bind_uint32_array(const Napi::Object& p) {
  const auto arr = p.As<Napi::Array>();
  const auto len = arr.Length();
  reserve_uint32(len);
  auto& vec = *_storage->uint32vec_ptr;
  for (uint32_t i = 0; i < len; ++i) {
    _indvec[i] = SQL_NULL_DATA;
    const auto elem = arr[i];
    if (!elem.IsNull() && !elem.IsUndefined()) {
      const auto v = elem.ToNumber().Uint32Value();
      vec[i] = v;
      _indvec[i] = 0;
    }
  }
}

void BoundDatum::reserve_uint32(const SQLLEN len) {
  constexpr auto size = sizeof(uint32_t);
  buffer_len = static_cast<SQLLEN>(len * size);
  _storage->ReserveUInt32(len);
  _indvec.resize(len);
  js_type = JS_UINT;
  c_type = SQL_C_ULONG;
  sql_type = SQL_BIGINT;
  buffer = _storage->uint32vec_ptr->data();
  param_size = size;
  digits = 0;
}

void BoundDatum::reserve_date(SQLLEN len) {
  buffer_len = sizeof(SQL_DATE_STRUCT);
  _storage->ReserveDate(len);
  _indvec.resize(len);
  // Since JS dates have no timezone context, all dates are assumed to be UTC
  js_type = JS_DATE;
  c_type = SQL_C_TYPE_DATE;
  // TODO: Determine proper SQL type based on version of server we're talking to
  sql_type = SQL_TYPE_DATE;
  buffer = _storage->datevec_ptr->data();
  // TODO: Determine proper precision and size based on version of server we're talking to
  if (param_size <= 0)
    param_size = sql_server_2008_default_datetime_precision;
  digits = sql_server_2008_default_datetime_scale;
  if (is_bcp) {
    param_size = sizeof(SQL_DATE_STRUCT);
    sql_type = SQLDATEN;
  }
}

void BoundDatum::bind_date(const Napi::Object& p) {
  reserve_date(1);
  auto& vec = *_storage->datevec_ptr;
  // Since JS dates have no timezone context, all dates are assumed to be UTC
  _indvec[0] = SQL_NULL_DATA;
  if (!p.IsNull() && !p.IsUndefined()) {
    const auto d = p.ToNumber().DoubleValue();
    auto& dt = vec[0];
    auto v = TimeUtils::createDateStruct(d, offset / 1000);
    dt = v;
    _indvec[0] = sizeof(SQL_DATE_STRUCT);
  }
}

void BoundDatum::bind_date_array(const Napi::Object& p) {
  const auto arr = p.As<Napi::Array>();
  const auto len = arr.Length();
  reserve_date(len);
  auto& vec = *_storage->datevec_ptr;
  for (uint32_t i = 0; i < len; ++i) {
    _indvec[i] = SQL_NULL_DATA;
    const auto elem = arr[i];
    if (!elem.IsNull() && !elem.IsUndefined()) {
      const auto d = elem.ToNumber().DoubleValue();
      auto& dt = vec[i];
      auto v = TimeUtils::createDateStruct(d, offset / 1000);
      dt = v;
      _indvec[i] = sizeof(SQL_DATE_STRUCT);
    }
  }
}

void BoundDatum::bind_time_array(const Napi::Object& p) {
  const auto arr = p.As<Napi::Array>();
  const auto len = arr.Length();
  reserve_time(len);
  auto& vec = *_storage->time2vec_ptr;
  for (uint32_t i = 0; i < len; ++i) {
    _indvec[i] = SQL_NULL_DATA;
    const auto elem = arr[i];
    if (!elem.IsNull() && !elem.IsUndefined()) {
      const auto d = elem.ToNumber().DoubleValue();
      auto& time2 = vec[i];
      auto v = TimeUtils::createTimeStruct(d, offset / 1000);
      time2 = v;
      _indvec[i] = sizeof(SQL_SS_TIME2_STRUCT);
    }
  }
}

void BoundDatum::bind_time(const Napi::Object& p) {
  reserve_time(1);
  // Since JS dates have no timezone context, all dates are assumed to be UTC
  _indvec[0] = SQL_NULL_DATA;
  auto& vec = *_storage->time2vec_ptr;
  if (!p.IsNull() && !p.IsUndefined()) {
    const auto d = p.ToNumber().DoubleValue();
    auto& time2 = vec[0];
    auto v = TimeUtils::createTimeStruct(d, offset / 1000);
    time2 = v;
    _indvec[0] = sizeof(SQL_SS_TIME2_STRUCT);
  }
}

void BoundDatum::reserve_time(const SQLLEN len) {
  buffer_len = sizeof(SQL_SS_TIME2_STRUCT);
  _storage->Reservetime2(len);
  _indvec.resize(len);
  // Since JS dates have no timezone context, all dates are assumed to be UTC
  js_type = JS_DATE;
  c_type = SQL_C_BINARY;
  // TODO: Determine proper SQL type based on version of server we're talking to
  sql_type = SQL_SS_TIME2;
  buffer = _storage->time2vec_ptr->data();
  // TODO: Determine proper precision and size based on version of server we're talking to

  if (param_size <= 0)
    param_size = sql_server_2008_default_time_precision;
  if (digits <= 0)
    digits = sql_server_2008_default_datetime_scale;
  if (is_bcp) {
    sql_type = SQLTIMEN;
    param_size = sizeof(SQL_SS_TIME2_STRUCT);
  }
}

void BoundDatum::bind_time_stamp(const Napi::Object& p) {
  reserve_time_stamp(1);
  _indvec[0] = SQL_NULL_DATA;
  auto& vec = *_storage->timestampvec_ptr;
  if (!p.IsNull() && !p.IsUndefined()) {
    // dates in JS are stored internally as ms count from Jan 1, 1970
    const auto d = p.ToNumber().DoubleValue();
    auto& ts = vec[0];
    auto v = TimeUtils::createTimestampStruct(d, offset / 1000);
    ts = v;
    _indvec[0] = buffer_len;
  }
}

void BoundDatum::bind_time_stamp_array(const Napi::Object& p) {
  const auto arr = p.As<Napi::Array>();
  const auto len = arr.Length();
  reserve_time_stamp(len);
  auto& vec = *_storage->timestampvec_ptr;
  for (uint32_t i = 0; i < len; ++i) {
    _indvec[i] = SQL_NULL_DATA;
    const auto elem = arr[i];
    if (!elem.IsNull() && !elem.IsUndefined()) {
      // dates in JS are stored internally as ms count from Jan 1, 1970
      const auto d = elem.ToNumber().DoubleValue();
      auto& ts = vec[i];
      auto v = TimeUtils::createTimestampStruct(d, offset / 1000);
      ts = v;
      _indvec[i] = sizeof(SQL_TIMESTAMP_STRUCT);
    }
  }
}

void BoundDatum::reserve_time_stamp(const SQLLEN len) {
  // buffer_len = static_cast<SQLLEN>(len) * static_cast<SQLLEN>(sizeof(SQL_TIMESTAMP_STRUCT));
  buffer_len = sizeof(SQL_TIMESTAMP_STRUCT);
  _storage->ReserveTimestamp(len);
  _indvec.resize(len);
  // Since JS dates have no timezone context, all dates are assumed to be UTC
  js_type = JS_DATE;
  c_type = SQL_C_TIMESTAMP;
  // TODO: Determine proper SQL type based on version of server we're talking to
  sql_type = SQL_TYPE_TIMESTAMP;
  buffer = _storage->timestampvec_ptr->data();
  // TODO: Determine proper precision and size based on version of server we're talking to
  if (param_size <= 0) {
    param_size = sql_server_2008_default_timestamp_precision;
  }
  if (digits <= 0) {
    digits = sql_server_2008_default_datetime_scale;
  }
  if (is_bcp) {
    sql_type = SQLDATETIME2N;
    param_size = sizeof(SQL_TIMESTAMP_STRUCT);
  }
}

void BoundDatum::bind_time_stamp_offset(const Napi::Object& p) {
  reserve_time_stamp_offset(1);
  // Since JS dates have no timezone context, all dates are assumed to be UTC
  _indvec[0] = SQL_NULL_DATA;
  if (!p.IsNull() && !p.IsUndefined()) {
    const auto d = p.ToNumber().DoubleValue();
    // dates in JS are stored internally as ms count from Jan 1, 1970
    auto& ts = (*_storage->timestampoffsetvec_ptr)[0];
    TimeUtils::createTimestampOffsetStruct(d, 0, offset, ts);
    _indvec[0] = buffer_len;
  }
}

void BoundDatum::reserve_time_stamp_offset(SQLLEN len) {
  buffer_len = sizeof(SQL_SS_TIMESTAMPOFFSET_STRUCT);
  _storage->timestampoffsetvec_ptr = make_shared<vector<SQL_SS_TIMESTAMPOFFSET_STRUCT>>(len);
  _indvec.resize(len);
  // Since JS dates have no timezone context, all dates are assumed to be UTC
  js_type = JS_DATE;
  c_type = SQL_C_BINARY;
  // TODO: Determine proper SQL type based on version of server we're talking to
  sql_type = SQL_SS_TIMESTAMPOFFSET;
  buffer = _storage->timestampoffsetvec_ptr->data();
  // TODO: Determine proper precision and size based on version of server we're talking to
  param_size = sql_server_2008_default_datetime_precision;
  if (digits <= 0)
    digits = sql_server_2008_default_datetime_scale;
  if (is_bcp) {
    sql_type = SQLDATETIMEOFFSETN;
    param_size = sizeof(SQL_SS_TIMESTAMPOFFSET_STRUCT);
  }
}

void BoundDatum::bind_time_stamp_offset_array(const Napi::Object& p) {
  const auto arr = p.As<Napi::Array>();
  const auto len = arr.Length();
  reserve_time_stamp_offset(len);
  auto& vec = *_storage->timestampoffsetvec_ptr;
  buffer_len = sizeof(SQL_SS_TIMESTAMPOFFSET_STRUCT);
  for (uint32_t i = 0; i < len; ++i) {
    _indvec[i] = SQL_NULL_DATA;
    const auto elem = arr[i];
    if (!elem.IsNull() && !elem.IsUndefined()) {
      const auto d = elem.ToNumber().DoubleValue();
      auto& ts = vec[i];
      TimeUtils::createTimestampOffsetStruct(d, 0, offset / 1000, ts);
      _indvec[i] = sizeof(SQL_SS_TIMESTAMPOFFSET_STRUCT);
    }
  }
}

void BoundDatum::bind_integer(const Napi::Object& p) {
  reserve_integer(1);
  auto& vec = *_storage->int64vec_ptr;
  _indvec[0] = SQL_NULL_DATA;
  if (!p.IsNull() && !p.IsUndefined()) {
    const auto v = p.ToNumber().Int64Value();
    vec[0] = static_cast<long long>(v);
    _indvec[0] = 0;
  }
}

void BoundDatum::reserve_big_integer(const SQLLEN len) {
  constexpr auto size = sizeof(DatumStorage::bigint_t);
  _storage->ReserveBigInt(len);
  _indvec.resize(len);
  js_type = JS_NUMBER;
  c_type = SQL_C_SBIGINT;
  sql_type = SQL_BIGINT;
  buffer = _storage->bigint_vec_ptr->data();
  buffer_len = static_cast<SQLLEN>(size) * len;
  param_size = size;
  digits = 0;
  if (is_bcp) {
    sql_type = SQLINT8;
    param_size = sizeof(int64_t);
  }
}

void BoundDatum::reserve_integer(const SQLLEN len) {
  constexpr auto size = sizeof(int64_t);
  _storage->ReserveInt64(len);
  _indvec.resize(len);
  js_type = JS_NUMBER;
  c_type = SQL_C_SBIGINT;
  sql_type = SQL_BIGINT;
  buffer = _storage->int64vec_ptr->data();
  buffer_len = static_cast<SQLLEN>(size) * len;
  param_size = size;
  digits = 0;
  if (is_bcp) {
    sql_type = SQLINT8;
    param_size = sizeof(int64_t);
  }
}

void BoundDatum::bind_integer_array(const Napi::Object& p) {
  const auto arr = p.As<Napi::Array>();
  const auto len = arr.Length();
  reserve_integer(len);
  auto& vec = *_storage->int64vec_ptr;
  for (uint32_t i = 0; i < len; ++i) {
    _indvec[i] = SQL_NULL_DATA;
    const auto elem = arr[i];
    if (!elem.IsNull() && !elem.IsUndefined()) {
      _indvec[i] = 0;
      const auto v = elem.ToNumber().Int64Value();
      vec[i] = v;
    }
  }
}

void BoundDatum::bind_float(const Napi::Object& p) {
  bind_double(p);
  sql_type = SQL_FLOAT;
}

void BoundDatum::bind_real(const Napi::Object& p) {
  bind_double(p);
  sql_type = SQL_REAL;
}

void BoundDatum::bind_double(const Napi::Object& p) {
  reserve_double(1);
  auto& vec = *_storage->doublevec_ptr;
  _indvec[0] = SQL_NULL_DATA;
  if (!p.IsNull() && !p.IsUndefined()) {
    const auto v = p.ToNumber().DoubleValue();
    vec[0] = v;
    _indvec[0] = 0;
  }
}

void BoundDatum::reserve_decimal(const SQLLEN len) {
  constexpr auto size = sizeof(double);
  _storage->ReserveDouble(len);
  _indvec.resize(len);
  js_type = JS_NUMBER;
  c_type = SQL_C_DOUBLE;
  sql_type = SQL_DECIMAL;
  buffer = _storage->doublevec_ptr->data();
  buffer_len = static_cast<SQLLEN>(size) * len;
  if (is_bcp) {
    sql_type = SQLFLTN;
    param_size = sizeof(double);
  }
}

void BoundDatum::bind_decimal(const Napi::Object& p) {
  reserve_decimal(1);
  auto& vec = *_storage->doublevec_ptr;
  _indvec[0] = SQL_NULL_DATA;
  if (!p.IsNull() && !p.IsUndefined()) {
    const auto v = p.ToNumber().DoubleValue();
    vec[0] = v;
    _indvec[0] = 0;
  }
}

void BoundDatum::bind_decimal_array(const Napi::Object& p) {
  const auto arr = p.As<Napi::Array>();
  const auto len = arr.Length();
  reserve_decimal(len);
  auto& vec = *_storage->doublevec_ptr;
  for (uint32_t i = 0; i < len; ++i) {
    _indvec[i] = SQL_NULL_DATA;
    const auto elem = arr[i];
    if (elem.IsNull() || elem.IsUndefined())
      continue;
    const auto v = elem.ToNumber().DoubleValue();
    vec[i] = v;
    if (is_bcp) {
      _indvec[i] = sizeof(double);
    } else {
      _indvec[i] = 0;
    }
  }
}

void BoundDatum::reserve_double(const SQLLEN len) {
  constexpr auto size = sizeof(double);
  _storage->ReserveDouble(len);
  _indvec.resize(len);
  js_type = JS_NUMBER;
  c_type = SQL_C_DOUBLE;
  sql_type = SQL_DOUBLE;
  buffer = _storage->doublevec_ptr->data();
  buffer_len = static_cast<SQLLEN>(size) * len;
  param_size = size;
  // digits = 0;
  if (is_bcp) {
    sql_type = SQLFLT8;
    param_size = sizeof(double);
  }
}

void BoundDatum::bind_double_array(const Napi::Object& p) {
  const auto arr = p.As<Napi::Array>();
  const auto len = arr.Length();
  reserve_double(len);
  auto& vec = *_storage->doublevec_ptr;
  for (uint32_t i = 0; i < len; ++i) {
    _indvec[i] = SQL_NULL_DATA;
    const auto elem = arr[i];
    if (elem.IsNull() || elem.IsUndefined())
      continue;
    const auto v = elem.ToNumber().DoubleValue();
    vec[i] = v;
    if (is_bcp) {
      _indvec[i] = sizeof(double);
    } else {
      _indvec[i] = 0;
    }
  }
}

void BoundDatum::bind_number(const Napi::Object& p) {
  // numbers can be either integers or doubles.  We attempt to determine which it is through a
  // simple cast and equality check
  const auto maybe = p.ToNumber();
  const auto d = static_cast<long double>(maybe.ToNumber().DoubleValue());
  if (d == floor(d) && d >= static_cast<long double>(numeric_limits<int64_t>::min()) &&
      d <= static_cast<long double>(numeric_limits<int64_t>::max())) {
    bind_integer(p);
  } else {
    bind_double(p);
  }
}

void BoundDatum::bind_number_array(const Napi::Object& pp) {
  const Napi::Array arr = pp.As<Napi::Array>();
  if (arr.Length() == 0) {
    bind_double_array(pp);
    return;
  }

  const Napi::Value first_elem = arr[static_cast<uint32_t>(0)];
  if (!first_elem.IsNumber()) {
    bind_double_array(pp);
    return;
  }

  const auto d = static_cast<long double>(first_elem.ToNumber().DoubleValue());
  if (d == floor(d) && d >= static_cast<long double>(numeric_limits<int64_t>::min()) &&
      d <= static_cast<long double>(numeric_limits<int64_t>::max())) {
    bind_integer_array(pp);
  } else {
    bind_double_array(pp);
  }
}

bool BoundDatum::bind(const Napi::Object o, const char* if_str, const uint16_t type) {
  auto val = o.Get(if_str);
  if (!val.IsUndefined()) {
    param_type = type;
    return bind_datum_type(val.As<Napi::Object>());
  }
  return false;
}

bool is_decimal(const string& v) {
  const auto res = v == "decimal";
  return res;
}

bool is_any_float(const string& v) {
  const auto res = v == "numeric" || v == "decimal" || v == "smallmoney" || v == "money" ||
                   v == "float" || v == "real";
  return res;
}

bool is_any_int(const string& v) {
  const auto res = v == "smallint" || v == "int" || v == "bigint" || v == "tinyint";
  return res;
}

bool is_tiny_int(const string& v) {
  const auto res = v == "tinyint";
  return res;
}

bool is_small_int(const string& v) {
  const auto res = v == "smallint";
  return res;
}

bool is_char(const string& v) {
  const auto res = v == "char";
  return res;
}

bool is_nvarchar(const string& v) {
  const auto res = v == "nvarchar";
  return res;
}

bool is_string(const string& v) {
  const auto res = v == "char" || v == "text" || v == "varchar";
  return res;
}

bool is_binary(const string& v) {
  const auto res = v == "binary";
  return res;
}

bool is_bit(const string& v) {
  const auto res = v == "bit";
  return res;
}

bool is_date(const string& v) {
  const auto res = v == "date" || v == "datetimeoffset" || v == "datetime2" ||
                   v == "smalldatetime" || v == "datetime" || v == "time";
  return res;
}

bool sql_type_s_maps_to_numeric(const Napi::Object p) {
  const auto v = JsObjectMapper::safeGetString(p.As<Napi::Object>(), "type_id", "");
  const auto res = is_any_float(v);
  return res;
}

bool sql_type_s_maps_to_u_int32(const Napi::Object p) {
  const auto v = JsObjectMapper::safeGetString(p.As<Napi::Object>(), "type_id", "");
  const auto res = v == "sbigint";
  return res;
}

bool sql_type_s_maps_to_any_int32(const Napi::Object p) {
  const auto v = JsObjectMapper::safeGetString(p.As<Napi::Object>(), "type_id", "");
  const auto res = is_any_int(v);
  return res;
}

bool sql_type_s_maps_to_tiny_int(const Napi::Object p) {
  const auto v = JsObjectMapper::safeGetString(p.As<Napi::Object>(), "type_id", "");
  const auto res = is_tiny_int(v);
  return res;
}

bool sql_type_s_maps_to_small_int(const Napi::Object p) {
  const auto v = JsObjectMapper::safeGetString(p.As<Napi::Object>(), "type_id", "");
  const auto res = is_small_int(v);
  return res;
}

bool sql_type_s_maps_to_char(const Napi::Object p) {
  const auto v = JsObjectMapper::safeGetString(p.As<Napi::Object>(), "type_id", "");
  const auto res = is_char(v);
  return res;
}

bool sql_type_s_maps_to_nvarchar(const Napi::Object p) {
  const auto v = JsObjectMapper::safeGetString(p.As<Napi::Object>(), "type_id", "");
  const auto res = is_nvarchar(v);
  return res;
}

bool sql_type_s_maps_to_string(const Napi::Object p) {
  const auto v = JsObjectMapper::safeGetString(p.As<Napi::Object>(), "type_id", "");
  const auto res = is_string(v);
  return res;
}

bool sql_type_s_maps_to_boolean(const Napi::Object p) {
  const auto v = JsObjectMapper::safeGetString(p.As<Napi::Object>(), "type_id", "");
  const auto res = is_bit(v);
  return res;
}

bool sql_type_s_maps_to_date(const Napi::Object p) {
  const auto v = JsObjectMapper::safeGetString(p.As<Napi::Object>(), "type_id", "");
  const auto res = is_date(v);
  return res;
}

bool BoundDatum::bind_datum_type(const Napi::Object& p) {
  if (p.IsNull()) {
    bind_null(p);
  } else if (p.IsString()) {
    bind_w_var_char(p);
  } else if (p.IsBoolean()) {
    bind_boolean(p);
  } else if (p.IsNumber()) {
    // In N-API, we need to check the number type ourselves
    const auto num = p.ToNumber();
    const auto d = num.DoubleValue();
    if (isnan(d) || !isfinite(d)) {
      err = const_cast<char*>("Invalid number parameter");
      return false;
    }

    // Check if it's an integer
    if (d == floor(d)) {
      // Check if it fits in int32 range
      if (d >= std::numeric_limits<int32_t>::min() && d <= std::numeric_limits<int32_t>::max()) {
        bind_int32(p);
      }
      // Check if it fits in uint32 range
      else if (d >= 0 && d <= std::numeric_limits<uint32_t>::max()) {
        bind_uint32(p);
      }
      // Otherwise treat as a general number
      else {
        bind_number(p);
      }
    } else {
      // Floating point number
      bind_number(p);
    }
  } else if (p.IsDate()) {
    bind_time_stamp_offset(p);
  } else if (p.IsBuffer()) {
    bind_var_binary(p);
  } else if (sql_type_s_maps_to_tvp(p)) {
    bind_tvp(p);
  } else {
    err = const_cast<char*>("Invalid parameter type");
    return false;
  }

  // Ensure c_type and sql_type are set to non-zero values
  if (c_type == 0 || sql_type == 0) {
    // Fallback to safe defaults if types weren't set
    if (c_type == 0) {
      c_type = SQL_C_CHAR;
    }
    if (sql_type == 0) {
      sql_type = SQL_VARCHAR;
    }
  }

  return true;
}

Napi::Value reserve_output_param(napi_env env, const Napi::Object p, const int size) {
  Napi::Value pval;

  if (sql_type_s_maps_to_any_int32(p) || sql_type_s_maps_to_boolean(p)) {
    pval = Napi::Number::New(env, 0);
  } else if (sql_type_s_maps_to_u_int32(p)) {
    pval = Napi::Number::New(env, 0);
  } else if (sql_type_s_maps_to_numeric(p)) {
    pval = Napi::Number::New(env, 0.0);
  } else if (sql_type_s_maps_to_date(p)) {
    pval = Napi::Date::New(env, 0);
  } else if (sql_type_s_maps_to_string(p)) {
    vector<char> b;
    b.resize(static_cast<size_t>(size) + 1);
    pval = Napi::String::New(env, b.data(), size + 1);
  } else {
    // Create a buffer filled with zeros
    pval = Napi::Buffer<uint8_t>::New(env, static_cast<size_t>(size));
  }
  return pval;
}

inline Napi::Value get(const char* key, const Napi::Object& local_object) {
  return local_object.Get(key);
}

bool BoundDatum::proc_bind(const Napi::Env& env, const Napi::Object& p, const Napi::Object& v) {
  const auto is_output_val = p.Get("is_output");
  const auto is_output =
      is_output_val.IsBoolean() ? is_output_val.As<Napi::Boolean>().Value() : false;
  const auto size = get("max_length", p).ToNumber().Int32Value();
  const auto pval = p.Has("val") ? p.Get("val") : env.Null();

  Napi::Value pval_value;
  if (pval.IsObject()) {
    const auto as_pval_object = pval.As<Napi::Object>();
    pval_value = get("value", as_pval_object);
  } else {
    pval_value = pval;
  }

  if (is_output) {
    if (pval_value.IsNull()) {
      param_type = SQL_PARAM_OUTPUT;
      pval_value = reserve_output_param(env, p, size);
    } else {
      param_type = SQL_PARAM_INPUT_OUTPUT;
    }
  } else {
    param_type = SQL_PARAM_INPUT;
  }

  if (pval.IsObject()) {
    const auto as_pval_object = pval.As<Napi::Object>();
    auto user_type_val = get("sql_type", as_pval_object);
    if (!user_type_val.IsUndefined()) {
      if (!sql_type_s_maps_to_tvp(p) && param_type == SQL_PARAM_INPUT) {
        return user_bind(as_pval_object, user_type_val.As<Napi::Object>());
      }
    }
  }

  bool res = true;

  if (!pval_value.IsNull() && !pval_value.IsUndefined()) {
    auto pval_obj = pval_value.As<Napi::Object>();
    res = bind_datum_type(pval_obj);
  } else if (pval.IsObject()) {
    auto pval_obj = pval.As<Napi::Object>();
    res = bind_datum_type(pval_obj);
  }
  return res;
}

void BoundDatum::assign_precision(Napi::Object& pv) {
  const auto precision = get("precision", pv);
  if (!precision.IsUndefined()) {
    param_size = precision.ToNumber().Int32Value();
  }

  const auto max_length_p = get("max_length", pv);
  if (!max_length_p.IsUndefined()) {
    max_length = max_length_p.ToNumber().Int32Value();
  }

  const auto money = get("money", pv);
  if (!money.IsUndefined()) {
    is_money = money.ToBoolean().Value();
  }

  const auto bcp = get("bcp", pv);
  if (!bcp.IsUndefined()) {
    is_bcp = bcp.ToBoolean().Value();
    if (is_bcp) {
      bcp_version = pv.Get("bcp_version").ToNumber().Int32Value();
      const auto table_name_str = get_as_string(pv, "table_name");
      if (!table_name_str.IsNull() && !table_name_str.IsUndefined() &&
          table_name_str.Utf16Value().length() > 0) {
        _storage->table = wide_from_js_string(table_name_str);
      }
      const auto position = get("ordinal_position", pv);
      if (!position.IsUndefined()) {
        ordinal_position = position.ToNumber().Int32Value();
      }
    }
  }

  const auto scale = get("scale", pv);
  if (!scale.IsUndefined()) {
    digits = scale.ToNumber().Int32Value();
  }

  const auto off = get("offset", pv);
  if (!off.IsUndefined()) {
    offset = off.ToNumber().Int32Value();
  }
}

void BoundDatum::sql_longvarbinary(const Napi::Object pp) {
  if (pp.IsArray()) {
    bind_var_binary_array(pp);
  } else {
    bind_long_var_binary(pp);
  }
}

void BoundDatum::sql_integer(const Napi::Object pp) {
  if (pp.IsArray()) {
    bind_int32_array(pp);
  } else {
    bind_int32(pp);
  }
}

void BoundDatum::sql_wvarchar(const Napi::Object pp) {
  if (pp.IsArray()) {
    bind_w_var_char_array(pp);
  } else {
    bind_w_var_char(pp);
  }
}

void BoundDatum::sql_wlongvarchar(const Napi::Object pp) {
  if (pp.IsArray()) {
    bind_w_var_char_array(pp);
  } else {
    // Check if pp has a "value" property (from the temp object)
    if (pp.Has("value")) {
      auto val = pp.Get("value");
      if (val.IsString()) {
        bind_w_long_var_char(val.As<Napi::Object>());
      } else {
        bind_w_long_var_char(pp);
      }
    } else {
      bind_w_long_var_char(pp);
    }
  }
}

void BoundDatum::sql_bit(const Napi::Object pp) {
  if (pp.IsArray()) {
    bind_boolean_array(pp);
  } else {
    bind_boolean(pp);
  }
}

void BoundDatum::sql_bigint(const Napi::Object pp) {
  if (pp.IsArray()) {
    bind_integer_array(pp);
  } else {
    bind_integer(pp);
  }
}

void BoundDatum::sql_double(const Napi::Object pp) {
  if (pp.IsArray()) {
    bind_double_array(pp);
  } else {
    bind_double(pp);
  }
}

void BoundDatum::sql_float(const Napi::Object pp) {
  if (pp.IsArray()) {
    bind_double_array(pp);
    if (!is_bcp) {
      sql_type = SQL_FLOAT;
    }
  } else {
    bind_float(pp);
  }
}

void BoundDatum::sql_real(const Napi::Object pp) {
  if (pp.IsArray()) {
    bind_double_array(pp);
    if (!is_bcp) {
      sql_type = SQL_REAL;
    }
  } else {
    bind_real(pp);
  }
}

void BoundDatum::sql_tinyint(const Napi::Object pp) {
  if (pp.IsArray()) {
    bind_int32_array(pp);
    if (!is_bcp) {
      sql_type = SQL_TINYINT;
    }
  } else {
    bind_tiny_int(pp);
  }
}

void BoundDatum::sql_smallint(const Napi::Object pp) {
  if (pp.IsArray()) {
    bind_int32_array(pp);
    if (!is_bcp) {
      sql_type = SQL_SMALLINT;
    }
  } else {
    bind_small_int(pp);
  }
}

void BoundDatum::sql_decimal(const Napi::Object pp) {
  if (pp.IsArray()) {
    if (is_bcp) {
      bind_numeric_array(pp);
    } else {
      bind_decimal_array(pp);
    }
  } else {
    bind_decimal(pp);
  }
}

void BoundDatum::sql_numeric(const Napi::Object pp) {
  if (pp.IsArray()) {
    bind_numeric_array(pp);
  } else {
    bind_numeric(pp);
  }
}

void BoundDatum::sql_char(const Napi::Object pp) {
  if (pp.IsArray()) {
    if (is_bcp) {
      bind_w_var_char_array(pp);
    } else {
      bind_var_char_array(pp);
    }
  } else {
    bind_char(pp);
  }
}

void BoundDatum::sql_varchar(const Napi::Object pp) {
  if (pp.IsArray()) {
    if (is_bcp) {
      bind_var_char_array(pp);
    } else {
      bind_w_var_char_array(pp);
    }
  } else {
    bind_var_char(pp);
  }
}

void BoundDatum::sql_ss_time2(const Napi::Object pp) {
  if (pp.IsArray()) {
    bind_time_array(pp);
  } else {
    bind_time(pp);
  }
}

void BoundDatum::sql_type_date(const Napi::Object pp) {
  if (pp.IsArray()) {
    bind_date_array(pp);
  } else {
    bind_date(pp);
  }
}

void BoundDatum::sql_type_timestamp(const Napi::Object pp) {
  if (pp.IsArray()) {
    bind_time_stamp_array(pp);
  } else {
    bind_time_stamp(pp);
  }
}

void BoundDatum::sql_ss_timestampoffset(const Napi::Object pp) {
  if (pp.IsArray()) {
    bind_time_stamp_offset_array(pp);
  } else {
    bind_time_stamp_offset(pp);
  }
}

void BoundDatum::sql_binary(Napi::Object pp) {
  if (pp.IsArray()) {
    bind_var_binary_array(pp);
  } else {
    if (pp.IsNull() || pp.IsBuffer()) {
      bind_binary(pp);
    } else {
      err = const_cast<char*>("Invalid parameter type");
    }
  }
}

void BoundDatum::sql_varbinary(Napi::Object pp) {
  if (pp.IsArray()) {
    bind_var_binary_array(pp);
  } else {
    if (pp.IsNull() || pp.IsBuffer()) {
      bind_var_binary(pp);
    } else {
      err = const_cast<char*>("Invalid parameter type");
    }
  }
}

bool BoundDatum::user_bind(const Napi::Object& p, const Napi::Object& v) {
  const auto local_sql_type = p.Get("sql_type").ToNumber().Int32Value();
  if (local_sql_type == 0)
    return false;
  sql_type = static_cast<SQLSMALLINT>(local_sql_type);

  auto pp = p.Get("value");

  // Check if value is null and handle it specially for binary types
  if (pp.IsNull() || pp.IsUndefined()) {
    switch (sql_type) {
      case SQL_BINARY:
      case SQL_VARBINARY:
      case SQL_LONGVARBINARY:
        bind_null(p);
        return true;
      default:
        bind_null(p);
        return true;
    }
  }

  Napi::Object p_obj = p.As<Napi::Object>();
  assign_precision(p_obj);

  switch (sql_type) {
    case SQL_LONGVARBINARY:
      if (pp.IsObject()) {
        sql_longvarbinary(pp.As<Napi::Object>());
      } else {
        bind_null(p);
      }
      break;

    case SQL_BINARY: {
      if (pp.IsObject()) {
        sql_binary(pp.As<Napi::Object>());
      } else {
        bind_null(p);
      }
      if (err)
        return false;
    } break;

    case SQL_VARBINARY: {
      if (pp.IsObject()) {
        sql_varbinary(pp.As<Napi::Object>());
      } else {
        bind_null(p);
      }
      if (err)
        return false;
    } break;

    case SQL_INTEGER:
      if (pp.IsNumber()) {
        bind_int32(pp.As<Napi::Object>());
      } else if (pp.IsObject()) {
        sql_integer(pp.As<Napi::Object>());
      } else {
        bind_null(p);
      }
      break;

    case SQL_VARCHAR:
      if (pp.IsString()) {
        bind_var_char(pp.As<Napi::Object>());
      } else if (pp.IsObject()) {
        sql_varchar(pp.As<Napi::Object>());
      } else {
        bind_null(p);
      }
      break;

    case SQL_WVARCHAR:
    case SQL_GUID:
      if (pp.IsString()) {
        bind_w_var_char(pp.As<Napi::Object>());
      } else if (pp.IsObject()) {
        sql_wvarchar(pp.As<Napi::Object>());
      } else {
        bind_null(p);
      }
      break;

    case SQL_WLONGVARCHAR:
      if (pp.IsObject()) {
        sql_wlongvarchar(pp.As<Napi::Object>());
      } else if (pp.IsString()) {
        // For WLongVarChar, we need to go through sql_wlongvarchar to handle precision properly
        auto env = p.Env();
        auto tempObj = Napi::Object::New(env);
        tempObj.Set("value", pp);
        sql_wlongvarchar(tempObj);
      } else {
        bind_null(p);
      }
      break;

    case SQL_BIT:
      if (pp.IsBoolean()) {
        bind_boolean(pp.As<Napi::Object>());
      } else if (pp.IsObject()) {
        sql_bit(pp.As<Napi::Object>());
      } else {
        bind_null(p);
      }
      break;

    case SQL_BIGINT:
      if (pp.IsNumber()) {
        bind_integer(pp.As<Napi::Object>());
      } else if (pp.IsObject()) {
        sql_bigint(pp.As<Napi::Object>());
      } else {
        bind_null(p);
      }
      break;

    case SQL_DOUBLE:
      if (pp.IsNumber()) {
        bind_double(pp.As<Napi::Object>());
      } else if (pp.IsObject()) {
        sql_double(pp.As<Napi::Object>());
      } else {
        bind_null(p);
      }
      break;

    case SQL_FLOAT:
      if (pp.IsNumber()) {
        bind_float(pp.As<Napi::Object>());
      } else if (pp.IsObject()) {
        sql_float(pp.As<Napi::Object>());
      } else {
        bind_null(p);
      }
      break;

    case SQL_REAL:
      if (pp.IsNumber()) {
        bind_real(pp.As<Napi::Object>());
      } else if (pp.IsObject()) {
        sql_real(pp.As<Napi::Object>());
      } else {
        bind_null(p);
      }
      break;

    case SQL_TINYINT:
      if (pp.IsNumber()) {
        bind_tiny_int(pp.As<Napi::Object>());
      } else if (pp.IsObject()) {
        sql_tinyint(pp.As<Napi::Object>());
      } else {
        bind_null(p);
      }
      break;

    case SQL_SMALLINT:
      if (pp.IsNumber()) {
        bind_small_int(pp.As<Napi::Object>());
      } else if (pp.IsObject()) {
        sql_smallint(pp.As<Napi::Object>());
      } else {
        bind_null(p);
      }
      break;

    case SQL_DECIMAL:
      if (pp.IsNumber()) {
        bind_decimal(pp.As<Napi::Object>());
      } else if (pp.IsObject()) {
        sql_decimal(pp.As<Napi::Object>());
      } else {
        bind_null(p);
      }
      break;

    case SQL_NUMERIC:
      if (pp.IsNumber()) {
        bind_numeric(pp.As<Napi::Object>());
      } else if (pp.IsObject()) {
        sql_numeric(pp.As<Napi::Object>());
      } else {
        bind_null(p);
      }
      break;

    case SQL_CHAR:
      if (pp.IsString()) {
        bind_char(pp.As<Napi::Object>());
      } else if (pp.IsObject()) {
        sql_char(pp.As<Napi::Object>());
      } else {
        bind_null(p);
      }
      break;

    case SQL_SS_TIME2:
      if (pp.IsDate()) {
        bind_time(pp.As<Napi::Object>());
      } else if (pp.IsObject()) {
        sql_ss_time2(pp.As<Napi::Object>());
      } else {
        bind_null(p);
      }
      break;

    case SQL_TYPE_DATE:
      if (pp.IsDate()) {
        bind_date(pp.As<Napi::Object>());
      } else if (pp.IsObject()) {
        sql_type_date(pp.As<Napi::Object>());
      } else {
        bind_null(p);
      }
      break;

    case SQL_TYPE_TIMESTAMP:
      if (pp.IsDate()) {
        bind_time_stamp(pp.As<Napi::Object>());
      } else if (pp.IsObject()) {
        sql_type_timestamp(pp.As<Napi::Object>());
      } else {
        bind_null(p);
      }
      break;

    case SQL_DATETIME:
      if (pp.IsDate()) {
        bind_time_stamp(pp.As<Napi::Object>());
      } else if (pp.IsObject()) {
        sql_type_timestamp(pp.As<Napi::Object>());
      } else {
        bind_null(p);
      }
      break;

    case SQL_SS_TIMESTAMPOFFSET:
      if (pp.IsDate()) {
        bind_time_stamp_offset(pp.As<Napi::Object>());
      } else if (pp.IsObject()) {
        sql_ss_timestampoffset(pp.As<Napi::Object>());
      } else {
        bind_null(p);
      }
      break;

    case SQL_UNKNOWN_TYPE:
    default:
      return false;
  }

  // Ensure c_type is set based on sql_type if it wasn't set properly
  if (c_type == 0) {
    switch (sql_type) {
      case SQL_CHAR:
      case SQL_VARCHAR:
      case SQL_LONGVARCHAR:
        c_type = SQL_C_CHAR;
        break;
      case SQL_WCHAR:
      case SQL_WVARCHAR:
      case SQL_WLONGVARCHAR:
        c_type = SQL_C_WCHAR;
        break;
      case SQL_TINYINT:
        c_type = SQL_C_TINYINT;
        break;
      case SQL_SMALLINT:
        c_type = SQL_C_SHORT;
        break;
      case SQL_INTEGER:
        c_type = SQL_C_LONG;
        break;
      case SQL_BIGINT:
        c_type = SQL_C_SBIGINT;
        break;
      case SQL_REAL:
        c_type = SQL_C_FLOAT;
        break;
      case SQL_FLOAT:
      case SQL_DOUBLE:
        c_type = SQL_C_DOUBLE;
        break;
      case SQL_DECIMAL:
      case SQL_NUMERIC:
        c_type = SQL_C_NUMERIC;
        break;
      case SQL_BIT:
        c_type = SQL_C_BIT;
        break;
      case SQL_BINARY:
      case SQL_VARBINARY:
      case SQL_LONGVARBINARY:
        c_type = SQL_C_BINARY;
        break;
      case SQL_TYPE_DATE:
        c_type = SQL_C_TYPE_DATE;
        break;
      case SQL_TYPE_TIME:
      case SQL_SS_TIME2:
        c_type = SQL_C_TYPE_TIME;
        break;
      case SQL_TYPE_TIMESTAMP:
      case SQL_DATETIME:
      case SQL_SS_TIMESTAMPOFFSET:
        c_type = SQL_C_TYPE_TIMESTAMP;
        break;
      default:
        c_type = SQL_C_CHAR;  // Safe default
        break;
    }
  }

  return true;
}

bool BoundDatum::bind_object(const Napi::Object& p) {
  // fprintf(stderr, "bind obj\n");

  auto v = get("is_output", p);
  if (!v.IsUndefined()) {
    return proc_bind(p.Env(), p, p);
  }

  v = get("sql_type", p);
  if (!v.IsUndefined()) {
    return user_bind(p, p);
  }

  const auto n = get_as_string(p, "name");
  if (!n.IsNull() && !n.IsUndefined() && n.Utf16Value().length() > 0) {
    name = wide_from_js_string(n);
    auto pp = get("value", p);
    if (!pp.IsUndefined() && pp.IsObject()) {
      return bind_datum_type(pp.As<Napi::Object>());
    }
  }

  return false;
}

bool BoundDatum::bind_array(const Napi::Object& pp) {
  const auto arr = pp.As<Napi::Array>();
  nodeTypeCounter counts;

  for (uint32_t i = 0; i < arr.Length(); ++i) {
    const auto p = arr[i];
    const auto l = p.As<Napi::Object>();
    counts.Decode(l);
  }

  if (counts.boolCount != 0) {
    bind_boolean_array(pp);
  } else if (counts.stringCount != 0) {
    bind_w_var_char_array(pp);
  } else if (counts.dateCount != 0) {
    bind_time_stamp_offset_array(pp);
  } else if (counts.bufferCount != 0) {
    bind_var_binary_array(pp);
  } else if (counts.getoutBoundsCount() > 0) {
    err = const_cast<char*>("Invalid number parameter");
    return false;
  } else if (counts.numberCount > 0 || (counts.int64Count > 0 && counts.int32Count > 0)) {
    bind_double_array(pp);
  } else if (counts.int64Count > 0) {
    bind_integer_array(pp);
  } else if (counts.int32Count != 0) {
    bind_int32_array(pp);
  } else if (counts.uint32Count != 0) {
    bind_uint32_array(pp);
  } else if (counts.nullCount == static_cast<int>(arr.Length())) {
    bind_null_array(pp);
  } else {
    err = const_cast<char*>("Invalid parameter type");
    return false;
  }

  return true;
}

const Napi::Object BoundDatum::unbind_null(const Napi::Env& env) const {
  return Napi::Object::New(env);
}

const Napi::String BoundDatum::unbind_string(const Napi::Env& env) const {
  if (!_storage->uint16vec_ptr || _storage->uint16vec_ptr->empty()) {
    return Napi::String::New(env, "");
  }

  // Convert UTF-16 to UTF-8 for N-API
  const auto* utf16_data = _storage->uint16vec_ptr->data();

  // For output parameters, use the indicator to determine actual string length
  size_t len = _storage->uint16vec_ptr->size();
  if (param_type == SQL_PARAM_OUTPUT || param_type == SQL_PARAM_INPUT_OUTPUT) {
    if (!_indvec.empty() && _indvec[0] > 0) {
      // The indicator contains the byte count, we need character count for UTF-16
      len = _indvec[0] / sizeof(uint16_t);
    }
  }

  // Create u16string from the data
  std::u16string u16str(reinterpret_cast<const char16_t*>(utf16_data), len);

  // Convert to UTF-8
  std::string utf8_str = StringUtils::U16StringToUtf8(u16str);

  return Napi::String::New(env, utf8_str);
}

const Napi::Number BoundDatum::unbind_double(const Napi::Env& env) const {
  const auto& vec = *_storage->doublevec_ptr;
  const auto s = Napi::Number::New(env, vec[0]);
  return s;
}

const Napi::Boolean BoundDatum::unbind_boolean(const Napi::Env& env) const {
  const auto& vec = *_storage->uint16vec_ptr;
  const auto s = Napi::Boolean::New(env, vec[0] != 0);
  return s;
}

const Napi::Number BoundDatum::unbind_int32(const Napi::Env& env) const {
  const auto& vec = *_storage->int32vec_ptr;
  const auto s = Napi::Number::New(env, vec[0]);
  return s;
}

const Napi::Number BoundDatum::unbind_uint32(const Napi::Env& env) const {
  const auto& vec = *_storage->uint32vec_ptr;
  const auto s = Napi::Number::New(env, vec[0]);
  return s;
}

const Napi::Number BoundDatum::unbind_number(const Napi::Env& env) const {
  Napi::Value v;
  if (sql_type == SQL_C_DOUBLE) {
    v = unbind_double(env);
  } else {
    const auto& vec = *_storage->int64vec_ptr;
    v = Napi::Number::New(env, vec[0]);
  }
  return v.As<Napi::Number>();
}

const Napi::Date BoundDatum::unbind_date(const Napi::Env& env) const {
  // Handle different storage types based on js_type
  double milliseconds = 0.0;

  if (_storage->timestampoffsetvec_ptr && !_storage->timestampoffsetvec_ptr->empty()) {
    const auto& ts = (*_storage->timestampoffsetvec_ptr)[0];
    // SQL_SS_TIMESTAMPOFFSET_STRUCT has year, month, day, hour, minute, second, fraction
    // fraction is in nanoseconds (billionths of a second)

    // Create a time_t from the components
    struct tm timeinfo = {};
    timeinfo.tm_year = ts.year - 1900;  // tm_year is years since 1900
    timeinfo.tm_mon = ts.month - 1;     // tm_mon is 0-based
    timeinfo.tm_mday = ts.day;
    timeinfo.tm_hour = ts.hour;
    timeinfo.tm_min = ts.minute;
    timeinfo.tm_sec = ts.second;

    // Convert to time_t (seconds since epoch)
    time_t rawtime = mktime(&timeinfo);

    // Convert to milliseconds and add the fractional part
    milliseconds = static_cast<double>(rawtime) * 1000.0;
    milliseconds += static_cast<double>(ts.fraction) / 1000000.0;  // nanoseconds to milliseconds

    // Adjust for timezone offset if needed
    // ts.timezone_hour and ts.timezone_minute contain the offset
  } else if (_storage->timestampvec_ptr && !_storage->timestampvec_ptr->empty()) {
    // Handle SQL_TIMESTAMP_STRUCT
    const auto& ts = (*_storage->timestampvec_ptr)[0];

    // Create a time_t from the components
    struct tm timeinfo = {};
    timeinfo.tm_year = ts.year - 1900;  // tm_year is years since 1900
    timeinfo.tm_mon = ts.month - 1;     // tm_mon is 0-based
    timeinfo.tm_mday = ts.day;
    timeinfo.tm_hour = ts.hour;
    timeinfo.tm_min = ts.minute;
    timeinfo.tm_sec = ts.second;

    // Convert to time_t (seconds since epoch)
    time_t rawtime = mktime(&timeinfo);

    // Convert to milliseconds and add the fractional part
    milliseconds = static_cast<double>(rawtime) * 1000.0;
    // SQL_TIMESTAMP_STRUCT fraction is in nanoseconds
    milliseconds += static_cast<double>(ts.fraction) / 1000000.0;
  } else if (_storage->datevec_ptr && !_storage->datevec_ptr->empty()) {
    // Handle SQL_DATE_STRUCT
    const auto& dt = (*_storage->datevec_ptr)[0];
    struct tm timeinfo = {};
    timeinfo.tm_year = dt.year - 1900;
    timeinfo.tm_mon = dt.month - 1;
    timeinfo.tm_mday = dt.day;

    time_t rawtime = mktime(&timeinfo);
    milliseconds = static_cast<double>(rawtime) * 1000.0;
  }

  return Napi::Date::New(env, milliseconds);
}

size_t BoundDatum::get_default_size(size_t len) const {
  if (len != 0)
    return len;
  const uint32_t defaultSize = _params->max_prepared_column_size;
  len = defaultSize > 0 ? defaultSize : 8 * 1024;
  return len;
}

void BoundDatum::reserve_column_type(const SQLSMALLINT type, size_t& len, const size_t row_count) {
  switch (type) {
    case SQL_SS_VARIANT:
      len = max(len, get_default_size(len));
      reserve_w_var_char_array(len, row_count);
      break;

    case SQL_CHAR:
    case SQL_VARCHAR:
      len = max(len, get_default_size(len));
      reserve_var_char_array(len + 1, row_count);
      break;

    case SQL_LONGVARCHAR:
    case SQL_WCHAR:
    case SQL_WVARCHAR:
    case SQL_WLONGVARCHAR:
    case SQL_SS_XML:
    case SQL_GUID:
      len = max(len, get_default_size(len));
      reserve_w_var_char_array(len + 1, row_count);
      break;

    case SQL_BIT:
      reserve_boolean(static_cast<SQLLEN>(row_count));
      break;

    case SQL_SMALLINT:
    case SQL_TINYINT:
    case SQL_INTEGER:
    case SQL_C_SLONG:
    case SQL_C_SSHORT:
    case SQL_C_STINYINT:
    case SQL_C_ULONG:
    case SQL_C_USHORT:
    case SQL_C_UTINYINT:
      reserve_integer(static_cast<SQLLEN>(row_count));
      break;

    case SQL_BIGINT:
      reserve_big_integer(static_cast<SQLLEN>(row_count));
      break;

    case SQL_DECIMAL:
    case SQL_NUMERIC:
    case SQL_REAL:
    case SQL_FLOAT:
    case SQL_DOUBLE:
      reserve_double(static_cast<SQLLEN>(row_count));
      break;

    case SQL_BINARY:
    case SQL_VARBINARY:
    case SQL_LONGVARBINARY:
    case SQL_SS_UDT:
      len = max(len, get_default_size(len));
      reserve_var_binary_array(len, row_count);
      break;

    case SQL_SS_TIMESTAMPOFFSET:
      reserve_time_stamp_offset(static_cast<SQLLEN>(row_count));
      break;

    case SQL_TYPE_TIME:
    case SQL_SS_TIME2:
      reserve_time(static_cast<SQLLEN>(row_count));
      break;

    case SQL_TIMESTAMP:
    case SQL_DATETIME:
    case SQL_TYPE_TIMESTAMP:
    case SQL_TYPE_DATE:
      reserve_time_stamp(static_cast<SQLLEN>(row_count));
      break;

    default:
      len = max(len, get_default_size(len));
      reserve_w_var_char_array(len, row_count);
      break;
  }
}

Napi::Value BoundDatum::unbind(const Napi::Env& env) const {
  Napi::Value v;

  switch (js_type) {
    case JS_STRING:
      v = unbind_string(env);
      break;

    case JS_BOOLEAN:
      v = unbind_boolean(env);
      break;

    case JS_INT:
      v = unbind_int32(env);
      break;

    case JS_UINT:
      v = unbind_uint32(env);
      break;

    case JS_DATE:
      v = unbind_date(env);
      break;

    case JS_NUMBER:
      v = unbind_number(env);
      break;

    default:
      v = unbind_null(env);
      break;
  }

  return v;
}
// namespace mssql
};  // namespace mssql
