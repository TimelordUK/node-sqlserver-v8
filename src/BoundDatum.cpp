#include <BoundDatum.h>
#include <BoundDatumHelper.h>
#include <TimestampColumn.h>
#include <QueryOperationParams.h>
#include <MutateJS.h>
#include <codecvt>
#include <locale>
#include <cstring>

namespace mssql
{
	constexpr int sql_server_2008_default_time_precision = 16;
	constexpr int sql_server_2008_default_datetime_precision = 34;
	constexpr int sql_server_2008_default_timestamp_precision = 27;
	constexpr int sql_server_2008_default_datetime_scale = 7;

	static Local<Boolean> get_as_bool(const Local<Value> o, const char* v)
	{
		const nodeTypeFactory fact;
		const auto context = fact.isolate->GetCurrentContext();
		const auto vp = Nan::New(v).ToLocalChecked();
		const auto false_val = Nan::New(false);
		if (o->IsNull())
		{
			return false_val;
		}
		if (!o->IsObject())
		{
			return false_val;
		}
		Local<Object> as_obj;
		if (!o->ToObject(context).ToLocal(&as_obj))
		{
			return false_val;
		}
		if (as_obj->IsNull())
		{
			return false_val;
		}
		Local<Value> as_val;
		if (!as_obj->Get(context, vp).ToLocal(&as_val))
		{
			return false_val;
		}
		if (as_val->IsNull())
		{
			return false_val;
		}
		
		return Nan::To<Boolean>(as_val).ToLocalChecked();
	}

	bool sql_type_s_maps_to_tvp(const Local<Value> p)
	{
		const auto is_user_defined = get_as_bool(p, "is_user_defined");
		if (is_user_defined->IsNull()) return false;
		const auto as_bool = MutateJS::as_boolean(is_user_defined);	
		return as_bool;
	}

	bool BoundDatum::bind(Local<Value>& p)
	{
		auto res = false;
		if (sql_type_s_maps_to_tvp(p))
		{
			bind_tvp(p);
			return true;
		}
		if (p->IsArray())
		{
			res = bind_array(p);
		}
		else if (p->IsObject())
		{
			res = bind_object(p);
		}
		if (!res) res = bind_datum_type(p);
		return res;
	}

	static Local<String> get_as_string(const Local<Value> o, const char* v)
	{
		const auto key = Nan::New<String>(v).ToLocalChecked();
		const auto ss = Nan::Get(Nan::To<Object>(o).ToLocalChecked(), key).ToLocalChecked();
		if (!ss.IsEmpty()) {
			return Nan::To<String>(ss).ToLocalChecked();
		}
		return Nan::EmptyString();
	}

	void BoundDatum::bind_null(const Local<Value>& p)
	{
		reserve_null(1);
		_indvec[0] = SQL_NULL_DATA;
	}

	void BoundDatum::bind_null_array(const Local<Value>& p)
	{
		const auto arr = Local<Array>::Cast(p);
		const auto len = arr->Length();
		reserve_null(len);
		for (uint32_t i = 0; i < len; ++i)
		{
			_indvec[i] = SQL_NULL_DATA;
		}
	}

	void BoundDatum::reserve_null(const SQLLEN len)
	{
		buffer_len = 0;
		_indvec.resize(len);
		js_type = JS_NULL;
		c_type = SQL_C_CHAR;
		sql_type = SQL_CHAR;
		param_size = 1;
		digits = 0;
		buffer = nullptr;
	}

	void BoundDatum::bind_w_long_var_char(const Local<Value>& p)
	{
		bind_w_var_char(p);
		sql_type = SQL_WLONGVARCHAR;
		param_size = buffer_len;
	}

	void BoundDatum::bind_w_var_char(const Local<Value>& p)
	{
		const auto str_param = Nan::To<String>(p).FromMaybe(Nan::EmptyString());	
		bind_w_var_char(p, str_param->Length());
	}

	void BoundDatum::bind_char(const Local<Value>& p)
	{
		bind_var_char(p);
		sql_type = SQL_CHAR;
	}

	void BoundDatum::bind_var_char(const Local<Value>& p)
	{
		const auto local = Nan::To<String>(p).FromMaybe(Nan::EmptyString());
		SQLULEN precision = local->Length();
		if (param_size > 0) precision = min(param_size, precision);
		bind_var_char(p, static_cast<int>(precision));
	}

	void BoundDatum::reserve_var_char_array(const size_t max_str_len, const size_t array_len)
	{
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
			if (max_str_len >= 4000)
			{
				param_size = 0;
			}
			else
			{
				param_size = max(buffer_len, static_cast<SQLLEN>(1));
			}
		}
	}
	
	void BoundDatum::bind_var_char(const Local<Value>& p, const int precision)
	{
		reserve_var_char_array(precision, 1);
		if (!p->IsNullOrUndefined())
		{	
			const auto str_param = Nan::To<String>(p).FromMaybe(Nan::EmptyString());
			Nan::Utf8String x(str_param);
			const auto *x_p = *x;
			memcpy(_storage->charvec_ptr->data(), x_p, precision);	
			_indvec[0] = precision;	
		}
	}
	
	int get_max_str_len(const Local<Value>& p)
	{
		auto str_len = 0;
		const auto arr = Local<Array>::Cast(p);
		const auto len = arr->Length();
		for (uint32_t i = 0; i < len; ++i)
		{	
			auto elem = Nan::Get(arr, i);
			if (elem.IsEmpty()) continue;
			auto maybe_value = Nan::To<String>(elem.ToLocalChecked());
			const auto str = maybe_value.FromMaybe(Nan::EmptyString()); 	
			if (str->Length() > str_len) {
				str_len = str->Length();
			}		
		}
		return str_len;
	}

	void BoundDatum::bind_var_char_array_bcp(const Local<Value>& p)
	{
		const auto arr = Local<Array>::Cast(p);
		const auto array_len = arr->Length();
		_storage->ReserveCharVec(array_len);
		_indvec.resize(array_len);
		sql_type = SQLVARCHAR;
		param_size = SQL_VARLEN_DATA;
		buffer_len = get_max_str_len(p);
		auto & vec = *_storage->char_vec_vec_ptr;
		for (uint32_t i = 0; i < array_len; ++i)
		{
			_indvec[i] = SQL_NULL_DATA;
			auto elem = Nan::Get(arr, i);
			if (elem.IsEmpty()) continue;
			const auto local_elem = elem.ToLocalChecked();
			if (local_elem->IsNullOrUndefined()) {
				continue;
			}
			auto maybe_value = Nan::To<String>(elem.ToLocalChecked());
			const auto str = maybe_value.FromMaybe(Nan::EmptyString()); 	
			const auto width = str->Length();
			_indvec[i] = width;
			Nan::Utf8String x(str);
			const auto *x_p = *x;
			_indvec[i] = width;
			const auto store = make_shared<DatumStorage::char_vec_t>(width);
			store->reserve(width);
			store->resize(width);
			vec[i] = store;
			const auto itr = store->data();
			memcpy(&*itr, x_p, width);		
		}
	}

	void BoundDatum::bind_var_char_array(const Local<Value>& p)
	{
		if (is_bcp) {
			bind_var_char_array_bcp(p);
			return;
		}
		const auto max_str_len = max(1, get_max_str_len(p));
		const auto arr = Local<Array>::Cast(p);
		const auto array_len = arr->Length();
		reserve_var_char_array(max_str_len, array_len);
		auto* const base = _storage->charvec_ptr->data();
		for (uint32_t i = 0; i < array_len; ++i)
		{
			auto* const itr = base + (max_str_len * i);
			_indvec[i] = SQL_NULL_DATA;
			auto elem = Nan::Get(arr, i);
			if (elem.IsEmpty()) continue;
			auto maybe_value = Nan::To<String>(elem.ToLocalChecked());
			const auto str = maybe_value.FromMaybe(Nan::EmptyString()); 	
			const auto width = str->Length();
			_indvec[i] = width;
			Nan::Utf8String x(str);
			const auto *x_p = *x;
			memcpy(&*itr, x_p, width);
		}
	}
	
	void BoundDatum::reserve_w_var_char_array(const size_t max_str_len, const size_t array_len)
	{
		js_type = JS_STRING;
		c_type = SQL_C_WCHAR;
		sql_type = max_str_len > 2000 && max_str_len < 4000 ? SQL_WLONGVARCHAR : SQL_WVARCHAR;
		constexpr auto size = sizeof(uint16_t);
		_indvec.resize(array_len);
		_storage->ReserveUint16(array_len * max_str_len);
		buffer = _storage->uint16vec_ptr->data();
		buffer_len = static_cast<SQLLEN>(max_str_len * size);
		if (max_length > 0) {
			param_size = max_length / 2;
		}
		else if (param_size <= 0) {
			if (max_str_len >= 4000)
			{
				param_size = 0;
			}
			else
			{
				param_size = max(buffer_len / 2, static_cast<SQLLEN>(1));
			}
		}
	}

	void BoundDatum::bind_w_var_char_array_bcp(const Local<Value>& p)
	{
		const auto arr = Local<Array>::Cast(p);
		const auto array_len = arr->Length();
		_storage->ReserveUint16Vec(array_len);
		_indvec.resize(array_len);
		sql_type = SQLNCHAR;
		param_size = SQL_VARLEN_DATA;
		buffer_len = get_max_str_len(p) + 1;
		bcp_terminator = reinterpret_cast<LPCBYTE>(L"");
		bcp_terminator_len = sizeof(WCHAR);
		auto & vec = *_storage->uint16_vec_vec_ptr;
		for (uint32_t i = 0; i < array_len; ++i)
		{
			_indvec[i] = SQL_NULL_DATA;
			auto elem = Nan::Get(arr, i);
			if (elem.IsEmpty()) continue;
			const auto local_elem = elem.ToLocalChecked();
			if (local_elem->IsNullOrUndefined()) {
				continue;
			}
			auto maybe_value = Nan::To<String>(local_elem);
			const auto str = maybe_value.FromMaybe(Nan::EmptyString()); 	
			const auto len = str->Length();
			constexpr auto size = sizeof(uint16_t);
			const auto store = make_shared<DatumStorage::uint16_t_vec_t>(len);
			store->reserve(len);
			store->resize(len);
			vec[i] = store;
			const auto itr = store->data();
			const auto width = len * size;
			_indvec[i] = static_cast<SQLLEN>(width);
			const size_t strlen = static_cast<size_t>(str->Length()) * 2;
			Nan::DecodeWrite(reinterpret_cast<char*>(&*itr), strlen, str, Nan::UCS2);
			store->push_back(0);
		}
	}

	void BoundDatum::bind_w_var_char_array(const Local<Value>& p)
	{
		if (is_bcp) {
			bind_w_var_char_array_bcp(p);
			return;
		}
		const auto max_str_len = max(1, get_max_str_len(p));
		const auto arr = Local<Array>::Cast(p);
		const auto array_len = arr->Length();
		reserve_w_var_char_array(max_str_len, array_len);
		auto* const base = _storage->uint16vec_ptr->data();
		for (uint32_t i = 0; i < array_len; ++i)
		{
			constexpr auto size = sizeof(uint16_t);
			auto* const itr = base + static_cast<SQLLEN>(max_str_len ) * i;
			_indvec[i] = SQL_NULL_DATA;
			auto elem = Nan::Get(arr, i);
			if (elem.IsEmpty()) continue;
			const auto local_elem = elem.ToLocalChecked();
			if (local_elem->IsNullOrUndefined()) continue;
			auto maybe_value = Nan::To<String>(local_elem);
			const auto str = maybe_value.FromMaybe(Nan::EmptyString()); 	
			const auto width = str->Length() * size;
			_indvec[i] = static_cast<SQLLEN>(width);
			const auto strlen = static_cast<size_t>(str->Length()) * 2;
			Nan::DecodeWrite(reinterpret_cast<char*>(&*itr), strlen, str, Nan::UCS2);
		}
	}

	void BoundDatum::bind_w_var_char(const Local<Value>& p, const int precision)
	{
		const size_t max_str_len = max(1, precision);
		reserve_w_var_char_array(max_str_len, 1);	
		_indvec[0] = SQL_NULL_DATA;
		if (!p->IsNullOrUndefined())
		{
			constexpr auto size = sizeof(uint16_t);
			const auto str_param = Nan::To<String>(p).FromMaybe(Nan::EmptyString());
			auto* const first_p = _storage->uint16vec_ptr->data();
			DecodeWrite(reinterpret_cast<char*>(first_p), static_cast<size_t>(str_param->Length()) * 2, str_param, Nan::UCS2);
			buffer_len = static_cast<SQLLEN>(precision) * static_cast<SQLLEN>(size);
			_indvec[0] = buffer_len;
		}
	}

	size_t get_max_object_len(const Local<Value>& p)
	{
		size_t obj_len = 0;
		const auto arr = Local<Array>::Cast(p);
		const auto len = arr->Length();
		for (uint32_t i = 0; i < len; ++i)
		{
			auto elem = Nan::Get(arr, i);
			if (elem.IsEmpty()) continue;
			const auto local = elem.ToLocalChecked();
			if (local->IsNullOrUndefined()) continue;
			auto maybe_value = Nan::To<Object>(local);
			if (maybe_value.IsEmpty()) continue;
			const auto local_instance = maybe_value.ToLocalChecked();
			const auto width = node::Buffer::Length(local_instance);
			if (width > obj_len) obj_len = width;
		}
		return obj_len;
	}

	void BoundDatum::bind_long_var_binary(Local<Value>& p)
	{
		bind_var_binary(p);
		sql_type = SQL_LONGVARBINARY;
	}

	void BoundDatum::reserve_binary_array(const size_t max_obj_len, const size_t array_len)
	{
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

	void BoundDatum::reserve_var_binary_array(const size_t max_obj_len, const size_t array_len)
	{
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
	 *const auto r = SQLBindParameter(*_statement, current_param, datum.param_type, datum.c_type, datum.sql_type,
									  datum.param_size, datum.digits, datum.buffer, datum.buffer_len, datum.get_ind_vec().data());


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

	static int get_row_count(const Local<Value>& p)
	{
		auto rows = 1;
		auto maybe_object = Nan::To<Object>(p);
		if (maybe_object.IsEmpty()) return -1;
		const auto local = maybe_object.ToLocalChecked();	
		auto maybe_get = Nan::Get(local, Nan::New<String>("row_count").FromMaybe(Nan::EmptyString()));
		if (maybe_get.IsEmpty()) return rows;
		const auto int32 = Nan::To<int>(maybe_get.ToLocalChecked());
		rows = int32.FromMaybe(1);
		return rows;
	}

	wstring wide_from_js_string(const Local<String> s)
	{		
		wstring_convert<codecvt_utf8_utf16<wchar_t>> converter;
		Nan::Utf8String x(s);
		const auto *x_p = *x;
		const string narrow = x_p;
		auto wide = converter.from_bytes(narrow);
		return wide;
	}

	void BoundDatum::bind_tvp(Local<Value>& p)
	{
		wstring_convert<codecvt_utf8_utf16<wchar_t>> converter;
		// string narrow = converter.to_bytes(wide_utf16_source_string);
		// fprintf(stderr, "bind tvp\n");
		is_tvp = true;
		param_type = SQL_PARAM_INPUT;
		c_type = SQL_C_DEFAULT;
		sql_type = SQL_SS_TABLE;
		const auto rows = get_row_count(p);
		const auto type_id_str = get_as_string(p, "type_id");
		const auto schema_str = get_as_string(p, "schema");
		
		if (!schema_str->IsNullOrUndefined())
		{
			_storage->schema = wide_from_js_string(schema_str);
		}
		_indvec.resize(1);
		const size_t precision = type_id_str->Length();
		_storage->ReserveChars(precision + 1);
		_storage->ReserveUint16(precision + 1);
		auto* itr_p = _storage->charvec_ptr->data();
		Nan::Utf8String x(type_id_str);
		const auto *x_p = *x;
		memcpy(itr_p, x_p, precision);
		//type_id_str->WriteUtf8(fact.isolate, itr_p, precision);
		const string narrow = _storage->charvec_ptr->data();
		const auto type_name = converter.from_bytes(narrow);
		const auto type_name_vec = wstr2wcvec(type_name);
		constexpr auto size = sizeof(type_name_vec[0]);
		memcpy(_storage->uint16vec_ptr->data(), type_name_vec.data(), precision * size);
		buffer = _storage->uint16vec_ptr->data();
		buffer_len = static_cast<SQLLEN>(precision) * static_cast<SQLLEN>(size);
		param_size = rows; // max no of rows.
		_indvec[0] = rows; // no of rows.
		digits = 0;
	}

	void BoundDatum::bind_binary(Local<Value>& p)
	{
		Local<Object> o;
		_indvec[0] = SQL_NULL_DATA;
		if (!p->IsNullOrUndefined()) {
		 	o = p.As<Object>();
		}
		const auto valid = !p->IsNullOrUndefined() && !o->IsNullOrUndefined();
		const auto obj_len = valid ? node::Buffer::Length(o) : 0;
		reserve_binary_array(obj_len, 1);

		if (valid)
		{
			const auto itr = _storage->charvec_ptr->begin();
			const auto* const ptr = node::Buffer::Data(o);
			_indvec[0] = static_cast<SQLLEN>(obj_len);
			memcpy(&*itr, ptr, obj_len);
		}
	}

	void BoundDatum::bind_var_binary(Local<Value>& p)
	{
		Local<Object> o;
		_indvec[0] = SQL_NULL_DATA;
		if (!p->IsNullOrUndefined()) {
		 	o = p.As<Object>();
		}
		const auto valid = !p->IsNullOrUndefined() && !o->IsNullOrUndefined();
		const auto obj_len = valid ? node::Buffer::Length(o) : 0;
		reserve_var_binary_array(obj_len, 1);

		if (valid)
		{
			const auto itr = _storage->charvec_ptr->begin();
			const auto* const ptr = node::Buffer::Data(o);
			_indvec[0] = static_cast<SQLLEN>(obj_len);
			memcpy(&*itr, ptr, obj_len);
		}
	}

	void BoundDatum::bind_var_binary_array_bcp(const Local<Value>& p)
	{
		const auto arr = Local<Array>::Cast(p);
		const auto array_len = arr->Length();
		_storage->ReserveCharVec(array_len);
		_indvec.resize(array_len);
		sql_type = SQLVARBINARY;
		param_size = SQL_VARLEN_DATA;
		buffer_len = static_cast<SQLLEN>(get_max_object_len(p));
		auto & vec = *_storage->char_vec_vec_ptr;
		for (uint32_t i = 0; i < array_len; ++i)
		{
			_indvec[i] = SQL_NULL_DATA;
			auto elem = Nan::Get(arr, i);
			if (elem.IsEmpty()) continue;
			const auto local_elem = elem.ToLocalChecked();
			if (local_elem->IsNullOrUndefined()) {
				continue;
			}
			auto maybe_value = Nan::To<Object>(local_elem);
			if (maybe_value.IsEmpty()) continue;
			const auto local_instance = maybe_value.ToLocalChecked();
			if (local_instance->IsNullOrUndefined()) continue;
			const auto* const ptr = node::Buffer::Data(local_instance);
			const auto obj_len = node::Buffer::Length(local_instance);
			_indvec[i] = static_cast<SQLLEN>(obj_len);
			const auto store = make_shared<DatumStorage::char_vec_t>(obj_len);
			store->reserve(obj_len);
			store->resize(obj_len);
			vec[i] = store;
			const auto itr = store->data();
			memcpy(&*itr, ptr, obj_len);		
		}
	}

	void BoundDatum::bind_var_binary_array(const Local<Value>& p)
	{
		if (is_bcp) {
			bind_var_binary_array_bcp(p);
			return;
		}

		const auto arr = Local<Array>::Cast(p);
		const auto array_len = arr->Length();
		const auto max_obj_len = get_max_object_len(p);
		reserve_var_binary_array(max_obj_len, array_len);
		auto* const base = _storage->charvec_ptr->data();
		for (uint32_t i = 0; i < array_len; ++i)
		{
			auto* const itr = base + (max_obj_len * i);
			_indvec[i] = SQL_NULL_DATA;
			auto elem = Nan::Get(arr, i);
			if (elem.IsEmpty()) continue;
			const auto toLocal = elem.ToLocalChecked();
			if (toLocal->IsNullOrUndefined()) continue;
			auto maybe_value = Nan::To<Object>(toLocal);
			if (maybe_value.IsEmpty()) continue;
			const auto local_instance = maybe_value.ToLocalChecked();
			if (local_instance->IsNullOrUndefined()) continue;
			const auto* const ptr = node::Buffer::Data(local_instance);
			const auto obj_len = node::Buffer::Length(local_instance);
			_indvec[i] = static_cast<SQLLEN>(obj_len);
			memcpy(&*itr, ptr, obj_len);		
		}
	}

	void BoundDatum::bind_boolean(const Local<Value>& p)
	{
		reserve_boolean(1);
		auto& vec = *_storage->charvec_ptr;
		_indvec[0] = SQL_NULL_DATA;
		if (!p->IsNullOrUndefined())
		{
			const auto v = MutateJS::as_boolean(p);
			vec[0] = !v ? 0 : 1;
			_indvec[0] = 0;
		}
	}

	void BoundDatum::bind_boolean_array(const Local<Value>& p)
	{
		const auto arr = Local<Array>::Cast(p);
		const auto len = arr->Length();
		reserve_boolean(len);
		auto& vec = *_storage->charvec_ptr;	
		for (uint32_t i = 0; i < len; ++i)
		{
			_indvec[i] = SQL_NULL_DATA;
			const auto elem = Nan::Get(arr, i).ToLocalChecked();
			if (!elem->IsNullOrUndefined())
			{
				const auto v = MutateJS::as_boolean(elem);
				const auto b = !v ? 0 : 1;
				vec[i] = static_cast<char>(b);
				_indvec[i] = is_bcp ? sizeof(int8_t) : 0;
			}
		}
	}

	void BoundDatum::reserve_boolean(const SQLLEN len)
	{
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
		encode_numeric_struct(d, static_cast<int>(param_size), digits, ns);
			if(ns.scale < digits) {
				const double powers = pow(10, digits);
			scale_d *= powers;
		}
		return scale_d;
	}

	// if we are given 15 digits for say numeric(20,15) then
	// if only provided 5, will have to multiply by full scale

	void BoundDatum::bind_numeric_struct(double d,  SQL_NUMERIC_STRUCT & ns) {
		if (digits > 0) d = rescale(d, param_size, digits);
		encode_numeric_struct(d, static_cast<int>(param_size), digits, ns);
		if (param_size <= 0) param_size = ns.precision;
		if (digits <= 0) digits = static_cast<unsigned char>(ns.scale);
		else ns.scale = digits;
	}

	void BoundDatum::bind_numeric(const Local<Value>& p)
	{
		reserve_numeric(1);
		sql_type = SQL_NUMERIC;
		_indvec[0] = SQL_NULL_DATA;
		if (!p->IsNullOrUndefined())
		{
			const auto local = Nan::To<Number>(p).ToLocalChecked();
			auto d = local->Value();
			auto& vec = *_storage->numeric_ptr;
			auto& ns = vec[0];
			bind_numeric_struct(d, ns);
			_indvec[0] = sizeof(SQL_NUMERIC_STRUCT);
		}
	}

	void BoundDatum::bind_numeric_array(const Local<Value>& p)
	{
		const auto arr = Local<Array>::Cast(p);
		const int len = arr->Length();
		reserve_numeric(len);
		auto& vec = *_storage->numeric_ptr;
		for (auto i = 0; i < len; ++i)
		{
			auto& ns = vec[i];
			_indvec[i] = SQL_NULL_DATA;
			const auto elem = Nan::Get(arr, i).ToLocalChecked();
			if (!elem->IsNullOrUndefined())
			{
				const auto num = Nan::To<Number>(elem).ToLocalChecked();
				const auto d = num->Value();
				bind_numeric_struct(d, ns);
				_indvec[i] = sizeof(SQL_NUMERIC_STRUCT);
			}
		}
	}

	void BoundDatum::reserve_numeric(const SQLLEN len)
	{
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

	void BoundDatum::bind_tiny_int(const Local<Value>& p)
	{
		bind_int8(p);
	}

	void BoundDatum::bind_small_int(const Local<Value>& p)
	{
		bind_int16(p);
	}

	void BoundDatum::bind_int8(const Local<Value>& p)
	{
		reserve_int8(1);
		_indvec[0] = SQL_NULL_DATA;
		auto& vec = *_storage->int8vec_ptr;
		vec[0] = SQL_NULL_DATA;
		if (!p->IsNullOrUndefined())
		{			
			const auto local = Nan::To<Int32>(p).FromMaybe(Nan::New<Int32>(0));	
			const auto d = local->Value();
			vec[0] = d;
			_indvec[0] = 0;
		}
	}

	void BoundDatum::bind_int16(const Local<Value>& p)
	{
		reserve_int16(1);
		_indvec[0] = SQL_NULL_DATA;
		auto& vec = *_storage->int16vec_ptr;
		vec[0] = SQL_NULL_DATA;
		if (!p->IsNullOrUndefined())
		{			
			const auto local = Nan::To<Int32>(p).FromMaybe(Nan::New<Int32>(0));	
			const auto d = local->Value();
			vec[0] = d;
			_indvec[0] = 0;
		}
	}

	void BoundDatum::bind_int32(const Local<Value>& p)
	{
		reserve_int32(1);
		_indvec[0] = SQL_NULL_DATA;
		auto& vec = *_storage->int32vec_ptr;
		vec[0] = SQL_NULL_DATA;
		if (!p->IsNullOrUndefined())
		{			
			const auto local = Nan::To<Int32>(p).FromMaybe(Nan::New<Int32>(0));	
			const auto d = local->Value();
			vec[0] = d;
			_indvec[0] = 0;
		}
	}

	void BoundDatum::bind_int16_array(const Local<Value>& p)
	{
		const auto arr = Local<Array>::Cast(p);
		const auto len = arr->Length();
		reserve_int16(len);
		auto& vec = *_storage->int16vec_ptr;

		for (unsigned int i = 0; i < len; ++i)
		{
			_indvec[i] = SQL_NULL_DATA;
			auto maybe_elem = Nan::Get(arr, i);
			if (!maybe_elem.IsEmpty()) {
				const auto local_elem = maybe_elem.ToLocalChecked();
				if (local_elem->IsNullOrUndefined()) continue;
				const auto local = Nan::To<Int32>(local_elem).FromMaybe(Nan::New<Int32>(0));
				vec[i] = local->Value();
				_indvec[i] = is_bcp ? sizeof(int16_t) : 0;
			}
		}
	}

	void BoundDatum::bind_int32_array(const Local<Value>& p)
	{
		const auto arr = Local<Array>::Cast(p);
		const auto len = arr->Length();
		reserve_int32(len);
		auto& vec = *_storage->int32vec_ptr;

		for (unsigned int i = 0; i < len; ++i)
		{
			_indvec[i] = SQL_NULL_DATA;
			auto maybe_elem = Nan::Get(arr, i);
			if (!maybe_elem.IsEmpty()) {
				const auto local_elem = maybe_elem.ToLocalChecked();
				if (local_elem->IsNullOrUndefined()) continue;
				const auto local = Nan::To<Int32>(local_elem).FromMaybe(Nan::New<Int32>(0));
				vec[i] = local->Value();
				_indvec[i] = is_bcp ? sizeof(int32_t) : 0;
			}
		}
	}

	void BoundDatum::reserve_int8(const SQLLEN len)
	{
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

	void BoundDatum::reserve_int16(const SQLLEN len)
	{
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

	void BoundDatum::reserve_int32(const SQLLEN len)
	{
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

	void BoundDatum::bind_uint32(const Local<Value>& p)
	{
		reserve_uint32(1);
		auto& vec = *_storage->uint32vec_ptr;
		_indvec[0] = SQL_NULL_DATA;
		if (!p->IsNullOrUndefined())
		{
			const auto local = Nan::To<Uint32>(p).FromMaybe(Nan::New<Uint32>(0));
			vec[0] = local->Value();
			_indvec[0] = 0;	
		}
	}

	void BoundDatum::bind_uint32_array(const Local<Value>& p)
	{
		const auto arr = Local<Array>::Cast(p);
		const auto len = arr->Length();
		reserve_uint32(len);
		auto& vec = *_storage->uint32vec_ptr;
		for (uint32_t i = 0; i < len; ++i)
		{
			_indvec[i] = SQL_NULL_DATA;
			auto maybe_elem = Nan::Get(arr, i);
			if (!maybe_elem.IsEmpty()) {
				const auto local_elem = maybe_elem.ToLocalChecked();
				if (local_elem->IsNullOrUndefined()) continue;
				const auto local = Nan::To<Uint32>(local_elem).FromMaybe(Nan::New<Uint32>(0));
				vec[i] = local->Value();
				_indvec[i] = 0;
			}
		}
	}

	void BoundDatum::reserve_uint32(const SQLLEN len)
	{
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

	void BoundDatum::reserve_date(SQLLEN len)
	{
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

	void bind_time_struct(const Local<Date> & d, SQL_SS_TIME2_STRUCT & time2, const int32_t offset) {
		const auto local = Nan::To<Number>(d).ToLocalChecked() ;
		const auto ms = local->Value() - offset * 60000;
		const TimestampColumn sql_date(-1, ms);
		sql_date.ToTime2Struct(time2);
	}

	void bind_timestamp_struct(const Local<Date> & d, SQL_TIMESTAMP_STRUCT & ts, const int32_t offset) {
		const auto local = Nan::To<Number>(d).ToLocalChecked() ;
		const auto ms = local->Value() - offset * 60000;
		const TimestampColumn sql_date(-1, ms);
		sql_date.to_timestamp_struct(ts);
	}

	void bind_timestamp_offset_struct(const Local<Date> & d, SQL_SS_TIMESTAMPOFFSET_STRUCT & ts, const int32_t offset) {
		const auto local = Nan::To<Number>(d).ToLocalChecked();
		const TimestampColumn sql_date(-1, local->Value(), 0, offset);
		sql_date.to_timestamp_offset(ts);
	}

	void bind_date_struct(const Local<Date> & d, SQL_DATE_STRUCT & dt, const int32_t offset) {
		const auto local = Nan::To<Number>(d).ToLocalChecked() ;
		const auto ms = local->Value() - offset * 60000;
		const TimestampColumn sql_date(-1, ms);
		sql_date.ToDateStruct(dt);
	}

	void BoundDatum::bind_date(const Local<Value>& p)
	{
		reserve_date(1);
		auto& vec = *_storage->datevec_ptr;
		// Since JS dates have no timezone context, all dates are assumed to be UTC
		_indvec[0] = SQL_NULL_DATA;
		if (!p->IsNullOrUndefined())
		{
			const auto d = Local<Date>::Cast<Value>(p);
			auto& dt = vec[0];
			bind_date_struct(d, dt, offset);
			_indvec[0] = sizeof(SQL_DATE_STRUCT);
		}
	}

	void BoundDatum::bind_date_array(const Local<Value>& p)
	{
		const auto arr = Local<Array>::Cast(p);
		const auto len = arr->Length();
		reserve_date(len);
		auto& vec = *_storage->datevec_ptr;
		for (uint32_t i = 0; i < len; ++i)
		{
			_indvec[i] = SQL_NULL_DATA;
			const auto elem = Nan::Get(arr, i).ToLocalChecked();
			if (!elem->IsNullOrUndefined())
			{
				const auto d = Local<Date>::Cast<Value>(elem);
				auto& dt = vec[i];
				bind_date_struct(d, dt, offset);
				_indvec[i] = sizeof(SQL_DATE_STRUCT);
			}
		}
	}

	void BoundDatum::bind_time_array(const Local<Value>& p)
	{
		const auto arr = Local<Array>::Cast(p);
		const auto len = arr->Length();
		reserve_time(len);
		auto& vec = *_storage->time2vec_ptr;
		for (uint32_t i = 0; i < len; ++i)
		{
			_indvec[i] = SQL_NULL_DATA;
			const auto elem = Nan::Get(arr, i).ToLocalChecked();
			if (!elem->IsNullOrUndefined())
			{
				const auto d = Local<Date>::Cast<Value>(elem);
				auto& time2 = vec[i];
				bind_time_struct(d, time2, offset);
				_indvec[i] = sizeof(SQL_SS_TIME2_STRUCT);
			}
		}
	}

	void BoundDatum::bind_time(const Local<Value>& p)
	{
		reserve_time(1);
		// Since JS dates have no timezone context, all dates are assumed to be UTC
		_indvec[0] = SQL_NULL_DATA;
		auto& vec = *_storage->time2vec_ptr;
		if (!p->IsNullOrUndefined())
		{
			const auto d = Local<Date>::Cast<Value>(p);
			auto& time2 = vec[0];
			bind_time_struct(d, time2, offset);
			_indvec[0] = sizeof(SQL_SS_TIME2_STRUCT);
		}
	}

	void BoundDatum::reserve_time(const SQLLEN len)
	{
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

		if (param_size <=0 ) param_size = sql_server_2008_default_time_precision;
		if (digits <= 0) digits = sql_server_2008_default_datetime_scale;
		if (is_bcp) {
			sql_type = SQLTIMEN;
			param_size = sizeof(SQL_SS_TIME2_STRUCT);
		}
	}

	void BoundDatum::bind_time_stamp(const Local<Value>& p)
	{
		reserve_time_stamp(1);
		_indvec[0] = SQL_NULL_DATA;
		auto& vec = *_storage->timestampvec_ptr;
		if (!p->IsNullOrUndefined())
		{
			// dates in JS are stored internally as ms count from Jan 1, 1970
			const auto d = Local<Date>::Cast<Value>(p);
			auto& ts = vec[0];
			bind_timestamp_struct(d, ts, offset);
			_indvec[0] = buffer_len;
		}
	}

	void BoundDatum::bind_time_stamp_array(const Local<Value>& p)
	{
		const auto arr = Local<Array>::Cast(p);
		const auto len = arr->Length();
		reserve_time_stamp(len);
		auto& vec = *_storage->timestampvec_ptr;
		for (uint32_t i = 0; i < len; ++i)
		{
			_indvec[i] = SQL_NULL_DATA;
			const auto elem = Nan::Get(arr, i).ToLocalChecked();
			if (!elem->IsNullOrUndefined())
			{
				// dates in JS are stored internally as ms count from Jan 1, 1970
				const auto d = Local<Date>::Cast<Value>(elem);
				auto& ts = vec[i];
				bind_timestamp_struct(d, ts, offset);
				_indvec[i] = sizeof(SQL_TIMESTAMP_STRUCT);
			}
		}
	}

	void BoundDatum::reserve_time_stamp(const SQLLEN len)
	{
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

	void BoundDatum::bind_time_stamp_offset(const Local<Value>& p)
	{
		reserve_time_stamp_offset(1);
		// Since JS dates have no timezone context, all dates are assumed to be UTC
		_indvec[0] = SQL_NULL_DATA;
		if (!p->IsNullOrUndefined())
		{
			const auto date_object = Local<Date>::Cast<Value>(p);
			assert(!date_object.IsEmpty());
			// dates in JS are stored internally as ms count from Jan 1, 1970
			auto& ts = (*_storage->timestampoffsetvec_ptr)[0];
			bind_timestamp_offset_struct(date_object, ts, offset);
			_indvec[0] = buffer_len;
		}
	}

	void BoundDatum::reserve_time_stamp_offset(SQLLEN len)
	{
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
		if (digits <= 0) digits = sql_server_2008_default_datetime_scale;
		if (is_bcp) {
			sql_type = SQLDATETIMEOFFSETN;
			param_size = sizeof(SQL_SS_TIMESTAMPOFFSET_STRUCT);
		}
	}

	void BoundDatum::bind_time_stamp_offset_array(const Local<Value>& p)
	{
		const auto arr = Local<Array>::Cast(p);
		const auto len = arr->Length();
		reserve_time_stamp_offset(len);
		auto& vec = *_storage->timestampoffsetvec_ptr;
		buffer_len = sizeof(SQL_SS_TIMESTAMPOFFSET_STRUCT);
		for (uint32_t i = 0; i < len; ++i)
		{
			_indvec[i] = SQL_NULL_DATA;
			const auto elem = Nan::Get(arr, i).ToLocalChecked();
			if (!elem->IsNullOrUndefined())
			{
				const auto d = Local<Date>::Cast<Value>(elem);
				auto& ts = vec[i];
				bind_timestamp_offset_struct(d, ts, offset);
				_indvec[i] = sizeof(SQL_SS_TIMESTAMPOFFSET_STRUCT);
			}
		}
	}

	void BoundDatum::bind_integer(const Local<Value>& p)
	{
		reserve_integer(1);
		auto& vec = *_storage->int64vec_ptr;
		_indvec[0] = SQL_NULL_DATA;
		if (!p->IsNullOrUndefined())
		{
			const auto local = Nan::To<Number>(p).ToLocalChecked();
			vec[0] = static_cast<long long>(local->Value());
			_indvec[0] = 0;
		}
	}

	void BoundDatum::reserve_big_integer(const SQLLEN len)
	{
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

	void BoundDatum::reserve_integer(const SQLLEN len)
	{
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

	void BoundDatum::bind_integer_array(const Local<Value>& p)
	{
		const auto arr = Local<Array>::Cast(p);
		const auto len = arr->Length();
		reserve_integer(len);
		auto& vec = *_storage->int64vec_ptr;
		for (uint32_t i = 0; i < len; ++i)
		{
			_indvec[i] = SQL_NULL_DATA;
			const auto elem = Nan::Get(arr, i).ToLocalChecked();
			if (!elem->IsNullOrUndefined())
			{
				_indvec[i] = 0;
				const auto v = Nan::To<int64_t>(elem).ToChecked();
				vec[i] = v;
			}
		}
	}

	void BoundDatum::bind_float(const Local<Value>& p)
	{
		bind_double(p);
		sql_type = SQL_FLOAT;
	}

	void BoundDatum::bind_real(const Local<Value>& p)
	{
		bind_double(p);
		sql_type = SQL_REAL;
	}

	void BoundDatum::bind_double(const Local<Value>& p)
	{
		reserve_double(1);
		auto& vec = *_storage->doublevec_ptr;
		_indvec[0] = SQL_NULL_DATA;
		if (!p->IsNullOrUndefined())
		{
			const auto v = Nan::To<double>(p).ToChecked();
			vec[0] = v;
			_indvec[0] = 0;	
		}
	}

	void BoundDatum::reserve_decimal(const SQLLEN len)
	{
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

	void BoundDatum::bind_decimal(const Local<Value>& p)
	{
		reserve_decimal(1);
		auto& vec = *_storage->doublevec_ptr;
		_indvec[0] = SQL_NULL_DATA;
		if (!p->IsNullOrUndefined())
		{
			const auto v = Nan::To<double>(p).ToChecked();
			vec[0] = v;
			_indvec[0] = 0;	
		}
	}

	void BoundDatum::bind_decimal_array(const Local<Value>& p)
	{
		const auto arr = Local<Array>::Cast(p);
		const auto len = arr->Length();
		reserve_decimal(len);
		auto& vec = *_storage->doublevec_ptr;
		for (uint32_t i = 0; i < len; ++i)
		{
			_indvec[i] = SQL_NULL_DATA;
			auto maybe = Nan::Get(arr, i);
			if (maybe.IsEmpty()) continue;
			const auto local_elem = maybe.ToLocalChecked();
			if (local_elem->IsNullOrUndefined()) continue;
			const auto v = Nan::To<double>(local_elem).ToChecked();
			vec[i] = v;
			if (is_bcp) {
				_indvec[i] = sizeof(double);
			} else {
				_indvec[i] = 0;
			}
		}
	}

	void BoundDatum::reserve_double(const SQLLEN len)
	{
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

	void BoundDatum::bind_double_array(const Local<Value>& p)
	{
		const auto arr = Local<Array>::Cast(p);
		const auto len = arr->Length();
		reserve_double(len);
		auto& vec = *_storage->doublevec_ptr;
		for (uint32_t i = 0; i < len; ++i)
		{
			_indvec[i] = SQL_NULL_DATA;
			auto maybe = Nan::Get(arr, i);
			if (maybe.IsEmpty()) continue;
			const auto local_elem = maybe.ToLocalChecked();
			if (local_elem->IsNullOrUndefined()) continue;
			const auto v = Nan::To<double>(local_elem).ToChecked();
			vec[i] = v;
			if (is_bcp) {
				_indvec[i] = sizeof(double);
			} else {
				_indvec[i] = 0;
			}
		}
	}

	void BoundDatum::bind_number(const Local<Value>& p)
	{
		// numbers can be either integers or doubles.  We attempt to determine which it is through a simple
		// cast and equality check
		const nodeTypeFactory fact;
		const auto context = fact.isolate->GetCurrentContext();
		const auto maybe = p->ToNumber(context);
		Local<Number> local;
		if (maybe.ToLocal(&local)) {
			const auto d = static_cast<long double>(local->Value());
			if (d == floor(d) &&
				d >= static_cast<long double>(numeric_limits<int64_t>::min()) &&
				d <= static_cast<long double>(numeric_limits<int64_t>::max()))
			{
				bind_integer(p);
			}
			else
			{
				bind_double(p);
			}
		}
	}

	void BoundDatum::bind_number_array(const Local<Value>& pp)
	{
		const nodeTypeFactory fact;
		const auto context = fact.isolate->GetCurrentContext();
		const auto arr = Local<Array>::Cast(pp);
		const auto maybe_elem = arr->Get(context, 0);
		Local<Value> p;
		if (maybe_elem.ToLocal(&p)) {
			const auto maybe = p->ToNumber(context);
			Local<Number> local;
			if (maybe.ToLocal(&local)) {
				const auto d = static_cast<long double>(local->Value());
				if (d == floor(d) &&
					d >= static_cast<long double>(numeric_limits<int64_t>::min()) &&
					d <= static_cast<long double>(numeric_limits<int64_t>::max()))
				{
					bind_integer_array(pp);
				}
				else
				{
					bind_double_array(pp);
				}
			}
		}
	}

	bool BoundDatum::bind(const Local<Object> o, const char* if_str, const uint16_t type)
	{
		auto val = Nan::Get(o, Nan::New(if_str).ToLocalChecked()).ToLocalChecked();
		if (!val->IsUndefined())
		{
			param_type = type;
			return bind_datum_type(val);
		}
		return false;
	}

	bool is_decimal(const wstring& v)
	{
		const auto res = v == L"decimal";
		return res;
	}

	bool is_any_float(const wstring& v)
	{
		const auto res = v == L"numeric"
			|| v == L"decimal"
			|| v == L"smallmoney"
			|| v == L"money"
			|| v == L"float"
			|| v == L"real";
		return res;
	}

	bool is_any_int(const wstring& v)
	{
		const auto res = v == L"smallint"
			|| v == L"int"
			|| v == L"bigint"
			|| v == L"tinyint";
		return res;
	}

	bool is_tiny_int(const wstring& v)
	{
		const auto res = v == L"tinyint";
		return res;
	}

	bool is_small_int(const wstring& v)
	{
		const auto res = v == L"smallint";
		return res;
	}

	bool is_char(const wstring& v)
	{
		const auto res = v == L"char";
		return res;
	}

	bool is_nvarchar(const wstring& v)
	{
		const auto res = v == L"nvarchar";
		return res;
	}

	bool is_string(const wstring& v)
	{
		const auto res = v == L"char"
			|| v == L"text"
			|| v == L"varchar";
		return res;
	}

	bool is_binary(const wstring& v)
	{
		const auto res = v == L"binary";
		return res;
	}

	bool is_bit(const wstring& v)
	{
		const auto res = v == L"bit";
		return res;
	}

	bool is_date(const wstring& v)
	{
		const auto res = v == L"date"
			|| v == L"datetimeoffset"
			|| v == L"datetime2"
			|| v == L"smalldatetime"
			|| v == L"datetime"
			|| v == L"time";
		return res;
	}


	bool sql_type_s_maps_to_numeric(const Local<Value> p)
	{
		const auto str = get_as_string(p, "type_id");
		const auto v = FromV8String(str);
		const auto res = is_any_float(v);
		return res;
	}

	bool sql_type_s_maps_to_u_int32(const Local<Value> p)
	{
		const auto str = get_as_string(p, "type_id");
		const auto v = FromV8String(str);
		const auto res = v == L"sbigint";
		return res;
	}

	bool sql_type_s_maps_to_any_int32(const Local<Value> p)
	{
		const auto str = get_as_string(p, "type_id");
		const auto v = FromV8String(str);
		const auto res = is_any_int(v);
		return res;
	}

	bool sql_type_s_maps_to_tiny_int(const Local<Value> p)
	{
		const auto str = get_as_string(p, "type_id");
		const auto v = FromV8String(str);
		const auto res = is_tiny_int(v);
		return res;
	}

	bool sql_type_s_maps_to_small_int(const Local<Value> p)
	{
		const auto str = get_as_string(p, "type_id");
		const auto v = FromV8String(str);
		const auto res = is_small_int(v);
		return res;
	}

	bool sql_type_s_maps_to_char(const Local<Value> p)
	{
		const auto str = get_as_string(p, "type_id");
		const auto v = FromV8String(str);
		const auto res = is_char(v);
		return res;
	}

		bool sql_type_s_maps_to_nvarchar(const Local<Value> p)
	{
		const auto str = get_as_string(p, "type_id");
		const auto v = FromV8String(str);
		const auto res = is_nvarchar(v);
		return res;
	}

	bool sql_type_s_maps_to_string(const Local<Value> p)
	{
		const auto str = get_as_string(p, "type_id");
		const auto v = FromV8String(str);
		const auto res = is_string(v);
		return res;
	}

	bool sql_type_s_maps_to_boolean(const Local<Value> p)
	{
		const auto str = get_as_string(p, "type_id");
		const auto v = FromV8String(str);
		const auto res = is_bit(v);
		return res;
	}

	bool sql_type_s_maps_to_date(const Local<Value> p)
	{
		const auto str = get_as_string(p, "type_id");
		const auto v = FromV8String(str);
		const auto res = is_date(v);
		return res;
	}

	bool BoundDatum::bind_datum_type(Local<Value>& p)
	{
		const nodeTypeFactory fact;
		const auto context = fact.isolate->GetCurrentContext();
		
		if (p->IsNull())
		{
			bind_null(p);
		}
		else if (p->IsString())
		{
			bind_w_var_char(p);
		}
		else if (p->IsBoolean())
		{
			bind_boolean(p);
		}
		else if (p->IsInt32())
		{
			bind_int32(p);
		}
		else if (p->IsUint32())
		{
			bind_uint32(p);
		}
		else if (p->IsNumber())
		{
			const auto maybe = p->ToNumber(context);
			Local<Number> local;
			if (maybe.ToLocal(&local)) {
				const auto d = local->Value();
				if (isnan(d) || !isfinite(d))
				{
					err = const_cast<char*>("Invalid number parameter");
					return false;
				}
				bind_number(p);
			}
		}
		else if (p->IsDate())
		{
			bind_time_stamp_offset(p);
		}
		else if (p->IsObject() && node::Buffer::HasInstance(p))
		{
			bind_var_binary(p);
		}
		else if (sql_type_s_maps_to_tvp(p))
		{
			bind_tvp(p);
		}
		else
		{
			err = const_cast<char*>("Invalid parameter type");
			return false;
		}

		return true;
	}

	Local<Value> reserve_output_param(const Local<Value> p, const int size)
	{
		Local<Value> pval;
		const nodeTypeFactory fact;

		if (sql_type_s_maps_to_any_int32(p) || sql_type_s_maps_to_boolean(p))
		{
			pval = fact.new_int32(0);
		}
		else if (sql_type_s_maps_to_u_int32(p))
		{
			pval = Nan::New<Integer>(0);
		}
		else if (sql_type_s_maps_to_numeric(p))
		{
			pval = Nan::New(0.0);
		}
		else if (sql_type_s_maps_to_date(p))
		{
			pval = fact.new_date();
		}
		else if (sql_type_s_maps_to_string(p))
		{
			vector<char> b;
			b.resize(static_cast<size_t>(size) + 1);
			pval = fact.new_string(b.data(), size + 1);
		}
		else
		{
			pval = fact.new_buffer(size);
		}
		return pval;
	}

	inline Local<Value> get(const char * key,Local<Object> local_object ) {
		return Nan::Get(local_object, Nan::New(key).ToLocalChecked()).ToLocalChecked();
	}

	bool BoundDatum::proc_bind(Local<Value>& p, Local<Value>& v)
	{
		const auto context = Nan::GetCurrentContext();
		const auto maybe_is_output = v->ToInteger(context);
		Local<Integer> is_output;
		if (!maybe_is_output.ToLocal(&is_output))
		{
			return false;
		}

		Local<Value> pval;
		const auto maybe_object = p->ToObject(context);
		Local<Object> local_object;
		if (!maybe_object.ToLocal(&local_object))
		{
			return false;
		}
		const auto maybe_size = get("max_length", local_object)->Int32Value(context);
		auto size = 0;
		if (!maybe_size.To(&size))
		{
			return false;
		}

		Local<Object> as_object;
		if (p->ToObject(context).ToLocal(&as_object))
		{
			pval = get("val", as_object);
		} else {
			pval = Nan::Null();
		}
		
		auto is_output_i = 0;
		if (!is_output->Int32Value(context).To(&is_output_i))
		{
			return false;
		}

		Local<Object> as_pval_object;
		if (!pval->ToObject(context).ToLocal(&as_pval_object))
		{
			return false;
		}
		Local<Value> pval_value = get("value", as_pval_object);	
		if (is_output_i != 0)
		{
			if (pval_value->IsNull()) {
				param_type = SQL_PARAM_OUTPUT;
				pval_value = reserve_output_param(p, size);
			} else {
				param_type = SQL_PARAM_INPUT_OUTPUT;
			}	
		}
		else
		{
			param_type = SQL_PARAM_INPUT;
		}
		auto user_type_val = get("sql_type", as_pval_object);	
		if (!user_type_val->IsUndefined())
		{
			if (!sql_type_s_maps_to_tvp(p) && param_type == SQL_PARAM_INPUT) {
				return user_bind(pval, user_type_val);
			}
		}
		
		bool res = true;
	
		if (!pval_value->IsNullOrUndefined()) {
			res = bind_datum_type(pval_value); 
		} else {
			res = bind_datum_type(pval); 
		}
		return res;
	}

	void BoundDatum::assign_precision(Local<Object>& pv)
	{
		const auto context = Nan::GetCurrentContext();
		const auto precision = get("precision", pv);
		if (!precision->IsUndefined())
		{
			const auto maybe_param_size = precision->Int32Value(context);
			param_size = maybe_param_size.FromMaybe(0);
		}

		const auto max_length_p = get("max_length", pv);
		if (!max_length_p->IsUndefined())
		{
			const auto maybe_max_length = max_length_p->Int32Value(context);
			max_length = maybe_max_length.FromMaybe(0);
		}

		const auto money = get("money", pv);
		if (!money->IsUndefined())
		{
			 is_money = Nan::To<bool>(money).ToChecked();
		}

		const auto bcp = get("bcp", pv);
		if (!bcp->IsUndefined())
		{
			 is_bcp = Nan::To<bool>(bcp).ToChecked();
			 if (is_bcp) {
				bcp_version = MutateJS::getint32(pv, "bcp_version");
				const auto table_name_str = get_as_string(pv, "table_name");
				if (!table_name_str->IsNullOrUndefined())
				{
					_storage->table = wide_from_js_string(table_name_str);
				}
				const auto position = get("ordinal_position", pv);
				if (!position->IsUndefined())
				{
					const auto maybe_offset = position->Int32Value(context);
					ordinal_position = static_cast<uint32_t>(maybe_offset.FromMaybe(0));
				}		
			 }
		}

		const auto scale = get("scale", pv);
		if (!scale->IsUndefined())
		{
			const auto maybe_digits = scale->Int32Value(context);
			digits = static_cast<SQLSMALLINT>(maybe_digits.FromMaybe(0));
		}

		const auto off = get("offset", pv);
		if (!off->IsUndefined())
		{
			const auto maybe_offset = off->Int32Value(context);
			offset = static_cast<int32_t>(maybe_offset.FromMaybe(0));
		}
	}

	void BoundDatum::sql_longvarbinary(Local<Value> pp)
	{
		if (pp->IsArray())
		{
			bind_var_binary_array(pp);
		}
		else
		{
			bind_long_var_binary(pp);
		}
	}

	void BoundDatum::sql_integer(const Local<Value> pp)
	{
		if (pp->IsArray())
		{
			bind_int32_array(pp);
		}
		else
		{
			bind_int32(pp);
		}
	}

	void BoundDatum::sql_wvarchar(const Local<Value> pp)
	{
		if (pp->IsArray())
		{
			bind_w_var_char_array(pp);
		}
		else
		{
			bind_w_var_char(pp);
		}
	}

	void BoundDatum::sql_wlongvarchar(const Local<Value> pp)
	{
		if (pp->IsArray())
		{
			bind_w_var_char_array(pp);
		}
		else
		{
			bind_w_long_var_char(pp);
		}
	}

	void BoundDatum::sql_bit(const Local<Value> pp)
	{
		if (pp->IsArray())
		{
			bind_boolean_array(pp);
		}
		else
		{
			bind_boolean(pp);
		}
	}

	void BoundDatum::sql_bigint(const Local<Value> pp)
	{
		if (pp->IsArray())
		{
			bind_integer_array(pp);
		}
		else
		{
			bind_integer(pp);
		}
	}

	void BoundDatum::sql_double(const Local<Value> pp)
	{
		if (pp->IsArray())
		{
			bind_double_array(pp);
		}
		else
		{
			bind_double(pp);
		}
	}

	void BoundDatum::sql_float(const Local<Value> pp)
	{
		if (pp->IsArray())
		{
			bind_double_array(pp);
			if (!is_bcp) {
				sql_type = SQL_FLOAT;
			}
		}
		else
		{
			bind_float(pp);
		}
	}

	void BoundDatum::sql_real(const Local<Value> pp)
	{
		if (pp->IsArray())
		{
			bind_double_array(pp);
			if (!is_bcp) {
				sql_type = SQL_REAL;
			}
		}
		else
		{
			bind_real(pp);
		}
	}

	void BoundDatum::sql_tinyint(const Local<Value> pp)
	{
		if (pp->IsArray())
		{
			bind_int32_array(pp);
			if (!is_bcp) {
				sql_type = SQL_TINYINT;
			}
		}
		else
		{
			bind_tiny_int(pp);
		}
	}

	void BoundDatum::sql_smallint(const Local<Value> pp)
	{
		if (pp->IsArray())
		{
			bind_int32_array(pp);
			if (!is_bcp) {
				sql_type = SQL_SMALLINT;
			}
		}
		else
		{
			bind_small_int(pp);
		}
	}

	void BoundDatum::sql_decimal(const Local<Value> pp)
	{
		if (pp->IsArray())
		{
			if (is_bcp) {
				bind_numeric_array(pp);
			} else {
				bind_decimal_array(pp);
			}
		}
		else
		{
			bind_decimal(pp);
		}
	}

	void BoundDatum::sql_numeric(const Local<Value> pp)
	{
		if (pp->IsArray())
		{
			bind_numeric_array(pp);
		}
		else
		{
			bind_numeric(pp);
		}
	}

	void BoundDatum::sql_char(const Local<Value> pp)
	{
		if (pp->IsArray())
		{
			if (is_bcp) {
				bind_w_var_char_array(pp);
			} else {
				bind_var_char_array(pp);
			}
		}
		else
		{
			bind_char(pp);
		}
	}

	void BoundDatum::sql_varchar(const Local<Value> pp)
	{
		if (pp->IsArray())
		{
			if (is_bcp) {
				bind_var_char_array(pp);
			} else {
				bind_w_var_char_array(pp);
			}
		}
		else
		{
			bind_var_char(pp);
		}
	}

	void BoundDatum::sql_ss_time2(const Local<Value> pp)
	{
		if (pp->IsArray())
		{
			bind_time_array(pp);
		}
		else
		{
			bind_time(pp);
		}
	}

	void BoundDatum::sql_type_date(const Local<Value> pp)
	{
		if (pp->IsArray())
		{
			bind_date_array(pp);
		}
		else
		{
			bind_date(pp);
		}
	}

	void BoundDatum::sql_type_timestamp(const Local<Value> pp)
	{
		if (pp->IsArray())
		{
			bind_time_stamp_array(pp);
		}
		else
		{
			bind_time_stamp(pp);
		}
	}

	void BoundDatum::sql_ss_timestampoffset(const Local<Value> pp)
	{
		if (pp->IsArray())
		{
			bind_time_stamp_offset_array(pp);
		}
		else
		{
			bind_time_stamp_offset(pp);
		}
	}

	void BoundDatum::sql_binary(Local<Value> pp)
	{
		if (pp->IsArray())
		{
			bind_var_binary_array(pp);
		}
		else
		{
			if (pp->IsNull()
				|| (pp->IsObject() && node::Buffer::HasInstance(pp)))
			{
				bind_binary(pp);
			}
			else
			{
				err = const_cast<char*>("Invalid parameter type");
			}
		}
	}


	void BoundDatum::sql_varbinary(Local<Value> pp)
	{
		if (pp->IsArray())
		{
			bind_var_binary_array(pp);
		}
		else
		{
			if (pp->IsNull()
				|| (pp->IsObject() && node::Buffer::HasInstance(pp)))
			{
				bind_var_binary(pp);
			}
			else
			{
				err = const_cast<char*>("Invalid parameter type");
			}
		}
	}

	bool BoundDatum::user_bind(Local<Value>& p, Local<Value>& v)
	{
		const nodeTypeFactory fact;
		const auto context = fact.isolate->GetCurrentContext();
		const auto maybe_sql_type = v->Int32Value(fact.isolate->GetCurrentContext());
		const auto local_sql_type = maybe_sql_type.FromMaybe(0);
		if (local_sql_type == 0) return false;
		sql_type = static_cast<SQLSMALLINT>(local_sql_type);
		param_type = SQL_PARAM_INPUT;

		const auto maybe_local = p->ToObject(context);
		Local<Object> as_local;
		if (!maybe_local.ToLocal(&as_local))
		{
			return false;
		}

		const auto pp = get("value", as_local);

		assign_precision(as_local);

		switch (sql_type)
		{
		case SQL_LONGVARBINARY:
			sql_longvarbinary(pp);
			break;

		case SQL_BINARY:
		{
			sql_binary(pp);
			if (err) return false;
		}
		break;

		case SQL_VARBINARY:
		{
			sql_varbinary(pp);
			if (err) return false;
		}
		break;

		case SQL_INTEGER:
			sql_integer(pp);
			break;

		case SQL_VARCHAR:
			sql_varchar(pp);
			break;

		case SQL_WVARCHAR:
			sql_wvarchar(pp);
			break;

		case SQL_WLONGVARCHAR:
			sql_wlongvarchar(pp);
			break;

		case SQL_BIT:
			sql_bit(pp);
			break;

		case SQL_BIGINT:
			sql_bigint(pp);
			break;

		case SQL_DOUBLE:
			sql_double(pp);
			break;

		case SQL_FLOAT:
			sql_float(pp);
			break;

		case SQL_REAL:
			sql_real(pp);
			break;

		case SQL_TINYINT:
			sql_tinyint(pp);
			break;

		case SQL_SMALLINT:
			sql_smallint(pp);
			break;

		case SQL_DECIMAL:
			sql_decimal(pp);
			break;

		case SQL_NUMERIC:
			sql_numeric(pp);
			break;

		case SQL_CHAR:
			sql_char(pp);
			break;

		case SQL_SS_TIME2:
			sql_ss_time2(pp);
			break;

		case SQL_TYPE_DATE:
			sql_type_date(pp);
			break;

		case SQL_TYPE_TIMESTAMP:
			sql_type_timestamp(pp);
			break;

		case SQL_DATETIME:
			sql_type_timestamp(pp);
			break;

		case SQL_SS_TIMESTAMPOFFSET:
			sql_ss_timestampoffset(pp);
			break;

		case SQL_UNKNOWN_TYPE:
		default:
			return false;
		}

		return true;
	}

	bool BoundDatum::bind_object(Local<Value>& p)
	{
		// fprintf(stderr, "bind obj\n");
		const nodeTypeFactory fact;
		const auto context = fact.isolate->GetCurrentContext();
		const auto maybe_object = p->ToObject(context);
		Local<Object> po;
		if (!maybe_object.ToLocal(&po))
		{
			return false;
		}

		auto v = get("is_output", po);
		if (!v->IsUndefined())
		{
			return proc_bind(p, v);
		}

		v = get("sql_type", po);
		if (!v->IsUndefined())
		{
			return user_bind(p, v);
		}

		const auto n = get_as_string(p, "name");
		if (!n->IsUndefined())
		{
			name = wide_from_js_string(n);
			auto pp = get("value", po);
			return bind_datum_type(pp);
		}
		
		return false;
	}

	bool BoundDatum::bind_array(Local<Value>& pp)
	{
		const auto arr = Local<Array>::Cast(pp);
		nodeTypeCounter counts;

		for (uint32_t i = 0; i < arr->Length(); ++i)
		{
			auto p = Nan::Get(arr, i);
			const auto l = p.ToLocalChecked();
			counts.Decode(l);
		}

		if (counts.boolCount != 0)
		{
			bind_boolean_array(pp);
		}
		else if (counts.stringCount != 0)
		{
			bind_w_var_char_array(pp);
		}
		else if (counts.dateCount != 0)
		{
			bind_time_stamp_offset_array(pp);
		}
		else if (counts.bufferCount != 0)
		{
			bind_var_binary_array(pp);
		}
		else if (counts.getoutBoundsCount() > 0)
		{
			err = const_cast<char*>("Invalid number parameter");
			return false;
		}
		else if (counts.numberCount > 0 || (counts.int64Count > 0 && counts.int32Count > 0))
		{
			bind_double_array(pp);
		}
		else if (counts.int64Count > 0)
		{
			bind_integer_array(pp);
		}
		else if (counts.int32Count != 0)
		{
			bind_int32_array(pp);
		}
		else if (counts.uint32Count != 0)
		{
			bind_uint32_array(pp);
		}
		else if (counts.nullCount == static_cast<int>(arr->Length()))
		{
			bind_null_array(pp);
		}
		else
		{
			err = const_cast<char*>("Invalid parameter type");
			return false;
		}

		return true;
	}

	Local<Value> BoundDatum::unbind_null()
	{
		const nodeTypeFactory fact;
		return fact.null();
	}

	Local<Value> BoundDatum::unbind_string() const
	{
		const auto s = Nan::New<String>(_storage->uint16vec_ptr->data()).ToLocalChecked();
		return s;
	}

	Local<Value> BoundDatum::unbind_double() const
	{
		const auto& vec = *_storage->doublevec_ptr;
		const auto s = Nan::New(vec[0]);
		return s;
	}

	Local<Value> BoundDatum::unbind_boolean() const
	{
		const auto& vec = *_storage->uint16vec_ptr;
		const auto s = Nan::New<Boolean>(vec[0] != 0);
		return s;
	}

	Local<Value> BoundDatum::unbind_int32() const
	{		
		const auto& vec = *_storage->int32vec_ptr;
		const auto s = Nan::New<Int32>(vec[0]);
		return s;
	}

	Local<Value> BoundDatum::unbind_uint32() const
	{	
		const auto& vec = *_storage->uint32vec_ptr;
		const auto s = Nan::New<Integer>(vec[0]);
		return s;
	}

	Local<Value> BoundDatum::unbind_number() const
	{
		Local<Value> v;
		if (sql_type == SQL_C_DOUBLE)
		{
			v = unbind_double();
		}
		else
		{
			const nodeTypeFactory fact;
			const auto& vec = *_storage->int64vec_ptr;
			v = fact.new_int64(vec[0]);
		}
		return v;
	}

	Local<Value> BoundDatum::unbind_date() const
	{
		const auto& vec = *_storage->timestampoffsetvec_ptr;
		TimestampColumn tsc(-1, vec[0]);
		return tsc.ToValue();
	}

	size_t BoundDatum::get_default_size(size_t len) const {
		if (len != 0) return len;
		const uint32_t defaultSize = _params->max_prepared_column_size();
		len = defaultSize > 0 ? defaultSize : 8 * 1024;
		return len;
	}

	void BoundDatum::reserve_column_type(const SQLSMALLINT type,  size_t& len, const size_t row_count)
	{
		switch (type)
		{
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

	Local<Value> BoundDatum::unbind() const
	{
		Local<Value> v;

		switch (js_type)
		{
		case JS_STRING:
			v = unbind_string();
			break;

		case JS_BOOLEAN:
			v = unbind_boolean();
			break;

		case JS_INT:
			v = unbind_int32();
			break;

		case JS_UINT:
			v = unbind_uint32();
			break;

		case JS_DATE:
			v = unbind_double();
			break;

		case JS_NUMBER:
			v = unbind_number();
			break;

		default:
			v = unbind_null();
			break;
		}

		return v;
	}
}
