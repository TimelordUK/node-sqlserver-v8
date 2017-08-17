#include <TimestampColumn.h>
#include <BoundDatum.h>

namespace mssql
{
	const int sql_server_2008_default_time_precision = 16;
	const int sql_server_2008_default_datetime_precision = 34;
	const int sql_server_2008_default_timestamp_precision = 27;
	const int sql_server_2008_default_datetime_scale = 7;

	bool BoundDatum::bind(Local<Value>& p)
	{
		auto res = false;
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

	void BoundDatum::bind_null(const Local<Value>& p)
	{
		reserve_null(1);
		indvec[0] = SQL_NULL_DATA;
	}

	void BoundDatum::bind_null_array(const Local<Value>& p)
	{
		const auto arr = Local<Array>::Cast(p);
		const auto len = arr->Length();
		reserve_null(len);
		for (uint32_t i = 0; i < len; ++i)
		{
			indvec[i] = SQL_NULL_DATA;
		}
	}

	void BoundDatum::reserve_null(SQLLEN len)
	{
		buffer_len = 0;
		indvec.resize(len);
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
		const auto str_param = p->ToString();
		bind_w_var_char(p, str_param->Length());
	}

	void BoundDatum::bind_char(const Local<Value>& p)
	{
		bind_var_char(p);
	}

	void BoundDatum::bind_var_char(const Local<Value>& p)
	{
		const auto str_param = p->ToString();
		SQLULEN precision = str_param->Length();
		if (param_size > 0) precision = min(param_size, precision);
		bind_var_char(p, static_cast<int>(precision));
	}

	void BoundDatum::reserve_var_char(size_t precision)
	{
		js_type = JS_STRING;
		c_type = SQL_C_CHAR;
		sql_type = SQL_VARCHAR;
		digits = 0;
		indvec[0] = SQL_NULL_DATA;
		storage->ReserveChars(max(1, static_cast<int>(precision)));
		auto* itr_p = storage->charvec_ptr->data();
		buffer = itr_p;
		buffer_len = precision;
		param_size = max(buffer_len, static_cast<SQLLEN>(1));
	}

	void BoundDatum::bind_var_char(const Local<Value>& p, int precision)
	{
		reserve_var_char(precision);
		if (!p->IsNull())
		{
			const auto str_param = p->ToString();
			str_param->WriteUtf8(storage->charvec_ptr->data(), precision);
			indvec[0] = precision;
		}
	}

	int getMaxStrLen(const Local<Value>& p)
	{
		auto str_len = 0;
		auto arr = Local<Array>::Cast(p);
		const auto len = arr->Length();
		for (uint32_t i = 0; i < len; ++i)
		{
			const auto str = arr->Get(i)->ToString();
			if (str->Length() > str_len) str_len = str->Length();
		}
		return str_len;
	}

	void BoundDatum::reserve_w_var_char_array(size_t maxStrLen, size_t arrayLen)
	{
		js_type = JS_STRING;
		c_type = SQL_C_WCHAR;
		sql_type = SQL_WVARCHAR;

		const auto size = sizeof(uint16_t);
		indvec.resize(arrayLen);
		storage->ReserveUint16(arrayLen * maxStrLen);
		buffer = storage->uint16vec_ptr->data();
		buffer_len = maxStrLen * size;
		param_size = maxStrLen;
	}

	void BoundDatum::bind_w_var_char_array(const Local<Value>& p)
	{
		const auto max_str_len = getMaxStrLen(p);
		auto arr = Local<Array>::Cast(p);
		const auto array_len = arr->Length();
		const auto size = sizeof(uint16_t);
		reserve_w_var_char_array(max_str_len, array_len);

		auto itr = storage->uint16vec_ptr->begin();
		for (uint32_t i = 0; i < array_len; ++i)
		{
			indvec[i] = SQL_NULL_DATA;
			const auto elem = arr->Get(i);
			if (!elem->IsNull())
			{
				const auto str = arr->Get(i)->ToString();
				const auto width = str->Length() * size;
				indvec[i] = width;
				str->Write(&*itr, 0, max_str_len);
			}
			itr += max_str_len;
		}
	}

	void BoundDatum::bind_w_var_char(const Local<Value>& p, int precision)
	{
		const size_t max_str_len = max(1, precision);
		const auto size = sizeof(uint16_t);
		reserve_w_var_char_array(max_str_len, 1);

		indvec[0] = SQL_NULL_DATA;
		if (!p->IsNull())
		{
			const auto str_param = p->ToString();
			const auto first_p = storage->uint16vec_ptr->data();
			str_param->Write(first_p, 0, precision);
			buffer_len = precision * size;
			if (precision > 4000)
			{
				param_size = 0;
			}
			else
			{
				param_size = max(buffer_len, static_cast<SQLLEN>(1));
			}

			indvec[0] = buffer_len;
		}
	}

	size_t getMaxObjectLen(const Local<Value>& p)
	{
		size_t obj_len = 0;
		auto arr = Local<Array>::Cast(p);
		const auto len = arr->Length();
		for (uint32_t i = 0; i < len; ++i)
		{
			const auto o = arr->Get(i)->ToObject();
			const auto width = node::Buffer::Length(o);
			if (width > obj_len) obj_len = width;
		}
		return obj_len;
	}

	void BoundDatum::bind_long_var_binary(Local<Value>& p)
	{
		bind_var_binary(p);
		sql_type = SQL_LONGVARBINARY;
	}

	void BoundDatum::reserve_var_binary_array(size_t maxObjLen, size_t arrayLen)
	{
		js_type = JS_BUFFER;
		c_type = SQL_C_BINARY;
		sql_type = SQL_VARBINARY;
		digits = 0;
		const auto size = sizeof(uint8_t);
		storage->ReserveChars(arrayLen * maxObjLen);
		indvec.resize(arrayLen);
		buffer = storage->charvec_ptr->data();
		buffer_len = maxObjLen * size;
		param_size = maxObjLen;
	}

	void BoundDatum::bind_var_binary( Local<Value> & p)
	{
		const auto o = p.As<Object>();
		indvec[0] = SQL_NULL_DATA;
		const auto obj_len = !o->IsNull() ? node::Buffer::Length(o) : 0;
		reserve_var_binary_array(obj_len, 1);

		if (!o->IsNull())
		{
			const auto itr = storage->charvec_ptr->begin();
			const auto ptr = node::Buffer::Data(o);
			indvec[0] = obj_len;
			memcpy(&*itr, ptr, obj_len);
		}
	}

	void BoundDatum::bind_var_binary_array(const Local<Value>& p)
	{
		auto arr = Local<Array>::Cast(p);
		const auto array_len = arr->Length();
		const auto max_obj_len = getMaxObjectLen(p);
		reserve_var_binary_array(max_obj_len, array_len);
		auto itr = storage->charvec_ptr->data();
		for (uint32_t i = 0; i < array_len; ++i)
		{
			indvec[i] = SQL_NULL_DATA;
			const auto elem = arr->Get(i);
			if (!elem->IsNull())
			{
				const auto o = elem->ToObject();
				const auto ptr = node::Buffer::Data(o);
				const auto obj_len = node::Buffer::Length(o);
				indvec[i] = obj_len;
				memcpy(&*itr, ptr, obj_len);
			}
			itr += max_obj_len;
		}
	}

	void BoundDatum::bind_boolean(const Local<Value>& p)
	{
		reserve_boolean(1);
		auto& vec = *storage->charvec_ptr;
		indvec[0] = SQL_NULL_DATA;
		if (!p->IsNull())
		{
			vec[0] = p->BooleanValue() == false ? 0 : 1;
			indvec[0] = 0;
		}
	}

	void BoundDatum::bind_boolean_array(const Local<Value>& p)
	{
		auto arr = Local<Array>::Cast(p);
		const auto len = arr->Length();
		reserve_boolean(len);
		auto& vec = *storage->charvec_ptr;
		for (uint32_t i = 0; i < len; ++i)
		{
			indvec[i] = SQL_NULL_DATA;
			const auto elem = arr->Get(i);
			if (!elem->IsNull())
			{
				const auto b = elem->BooleanValue() == false ? 0 : 1;
				vec[i] = b;
				indvec[i] = 0;
			}
		}
	}

	void BoundDatum::reserve_boolean(SQLLEN len)
	{
		const auto size = sizeof(char);
		buffer_len = len * size;
		storage->ReserveChars(len);
		indvec.resize(len);
		js_type = JS_BOOLEAN;
		c_type = SQL_C_BIT;
		sql_type = SQL_BIT;
		buffer = storage->charvec_ptr->data();
		param_size = size;
		digits = 0;
	}

	void BoundDatum::bind_numeric(const Local<Value>& p)
	{
		reserve_numeric(1);
		sql_type = SQL_NUMERIC;
		indvec[0] = SQL_NULL_DATA;
		if (!p->IsNull())
		{
			const auto d = p->NumberValue();
			auto& vec = *storage->numeric_ptr;
			auto& ns = vec[0];
			encodeNumericStruct(d, static_cast<int>(param_size), digits, ns);
			param_size = ns.precision;
			digits = ns.scale;
			indvec[0] = sizeof(SQL_NUMERIC_STRUCT);
		}
	}

	void BoundDatum::reserve_numeric(SQLLEN len)
	{
		definedPrecision = true;
		buffer_len = len * sizeof(SQL_NUMERIC_STRUCT);
		storage->ReserveNumerics(len);
		indvec.resize(len);
		js_type = JS_NUMBER;
		c_type = SQL_C_NUMERIC;
		sql_type = SQL_NUMERIC;
		buffer = storage->numeric_ptr->data();
	}

	void BoundDatum::bind_tiny_int(const Local<Value>& p)
	{
		bind_int32(p);
		sql_type = SQL_TINYINT;
	}

	void BoundDatum::bind_small_int(const Local<Value>& p)
	{
		bind_int32(p);
		sql_type = SQL_SMALLINT;
	}

	void BoundDatum::bind_int32(const Local<Value>& p)
	{
		reserve_int32(1);
		indvec[0] = SQL_NULL_DATA;
		auto& vec = *storage->int32vec_ptr;
		vec[0] = SQL_NULL_DATA;
		if (!p->IsNull())
		{
			vec[0] = p->Int32Value();
			indvec[0] = 0;
		}
	}

	void BoundDatum::bind_int32_array(const Local<Value>& p)
	{
		auto arr = Local<Array>::Cast(p);
		const int len = arr->Length();
		reserve_int32(len);
		auto& vec = *storage->int32vec_ptr;
		for (auto i = 0; i < len; ++i)
		{
			indvec[i] = SQL_NULL_DATA;
			const auto elem = arr->Get(i);
			if (!elem->IsNull())
			{
				vec[i] = elem->Int32Value();
				indvec[i] = 0;
			}
		}
	}

	void BoundDatum::reserve_int32(SQLLEN len)
	{
		const auto size = sizeof(int32_t);
		buffer_len = len * size;
		storage->ReserveInt32(len);
		indvec.resize(len);
		js_type = JS_INT;
		c_type = SQL_C_SLONG;
		sql_type = SQL_INTEGER;
		buffer = storage->int32vec_ptr->data();
		param_size = size;
		digits = 0;
	}

	void BoundDatum::bind_uint32(const Local<Value>& p)
	{
		reserve_uint32(1);
		auto& vec = *storage->uint32vec_ptr;
		indvec[0] = SQL_NULL_DATA;
		if (!p->IsNull())
		{
			vec[0] = p->Uint32Value();
			indvec[0] = 0;
		}
	}

	void BoundDatum::bind_uint32_array(const Local<Value>& p)
	{
		auto arr = Local<Array>::Cast(p);
		const auto len = arr->Length();
		reserve_uint32(len);
		auto& vec = *storage->uint32vec_ptr;
		for (uint32_t i = 0; i < len; ++i)
		{
			indvec[i] = SQL_NULL_DATA;
			const auto elem = arr->Get(i);
			if (!elem->IsNull())
			{
				vec[i] = elem->Uint32Value();
				indvec[i] = 0;
			}
		}
	}

	void BoundDatum::reserve_uint32(SQLLEN len)
	{
		const auto size = sizeof(uint32_t);
		buffer_len = len * size;
		storage->ReserveUInt32(len);
		indvec.resize(len);
		js_type = JS_UINT;
		c_type = SQL_C_ULONG;
		sql_type = SQL_BIGINT;
		buffer = storage->uint32vec_ptr->data();
		param_size = size;
		digits = 0;
	}

	void BoundDatum::bind_date(const Local<Value>& p)
	{
		reserve_date(1);
		// Since JS dates have no timezone context, all dates are assumed to be UTC
		indvec[0] = SQL_NULL_DATA;
		if (!p->IsNull())
		{
			auto date_object = Handle<Date>::Cast<Value>(p);
			assert(!date_object.IsEmpty());
			// dates in JS are stored internally as ms count from Jan 1, 1970
			const auto d = date_object->NumberValue();
			TimestampColumn sql_date(d);
			auto& dt = (*storage->datevec_ptr)[0];
			sql_date.ToDateStruct(dt);
			indvec[0] = buffer_len;
		}
	}

	void BoundDatum::reserve_date(SQLLEN len)
	{
		buffer_len = len * sizeof(SQL_DATE_STRUCT);
		storage->datevec_ptr = make_shared<vector<SQL_DATE_STRUCT>>(len);
		indvec.resize(len);
		// Since JS dates have no timezone context, all dates are assumed to be UTC		
		js_type = JS_DATE;
		c_type = SQL_C_TYPE_DATE;
		// TODO: Determine proper SQL type based on version of server we're talking to
		sql_type = SQL_TYPE_DATE;
		buffer = storage->datevec_ptr->data();
		// TODO: Determine proper precision and size based on version of server we're talking to
		if (param_size <= 0)
			param_size = sql_server_2008_default_datetime_precision;
		digits = sql_server_2008_default_datetime_scale;
	}

	void BoundDatum::bind_time(const Local<Value>& p)
	{
		reserve_time(1);
		// Since JS dates have no timezone context, all dates are assumed to be UTC
		indvec[0] = SQL_NULL_DATA;
		if (!p->IsNull())
		{
			auto date_object = Handle<Date>::Cast<Value>(p);
			assert(!date_object.IsEmpty());
			// dates in JS are stored internally as ms count from Jan 1, 1970
			const auto d = date_object->NumberValue();
			TimestampColumn sql_date(d);
			auto& time2 = (*storage->time2vec_ptr)[0];
			sql_date.ToTime2Struct(time2);
			indvec[0] = buffer_len;
		}
	}

	void BoundDatum::reserve_time(SQLLEN len)
	{
		buffer_len = len * sizeof(SQL_SS_TIME2_STRUCT);
		storage->Reservetime2(len);
		indvec.resize(len);
		// Since JS dates have no timezone context, all dates are assumed to be UTC		
		js_type = JS_DATE;
		c_type = SQL_C_BINARY;
		// TODO: Determine proper SQL type based on version of server we're talking to
		sql_type = SQL_SS_TIME2;
		buffer = storage->time2vec_ptr->data();
		// TODO: Determine proper precision and size based on version of server we're talking to

		param_size = sql_server_2008_default_time_precision;
		if (digits <= 0) digits = sql_server_2008_default_datetime_scale;
	}

	void BoundDatum::bind_time_stamp(const Local<Value>& p)
	{
		reserve_time_stamp(1);
		// Since JS dates have no timezone context, all dates are assumed to be UTC
		indvec[0] = SQL_NULL_DATA;
		if (!p->IsNull())
		{
			auto date_object = Handle<Date>::Cast<Value>(p);
			assert(!date_object.IsEmpty());
			// dates in JS are stored internally as ms count from Jan 1, 1970
			const auto d = date_object->NumberValue();
			TimestampColumn sql_date(d);
			auto& timestamp = (*storage->timestampvec_ptr)[0];
			sql_date.ToTimestampStruct(timestamp);
			indvec[0] = buffer_len;
		}
	}

	void BoundDatum::reserve_time_stamp(SQLLEN len)
	{
		buffer_len = len * sizeof(SQL_TIMESTAMP_STRUCT);
		storage->ReserveTimestamp(len);
		indvec.resize(len);
		// Since JS dates have no timezone context, all dates are assumed to be UTC		
		js_type = JS_DATE;
		c_type = SQL_C_TIMESTAMP;
		// TODO: Determine proper SQL type based on version of server we're talking to
		sql_type = SQL_TYPE_TIMESTAMP;
		buffer = storage->timestampvec_ptr->data();
		// TODO: Determine proper precision and size based on version of server we're talking to
		param_size = sql_server_2008_default_timestamp_precision;
		if (digits <= 0) digits = sql_server_2008_default_datetime_scale;
	}

	void BoundDatum::bind_time_stamp_offset(const Local<Value>& p)
	{
		reserve_time_stamp_offset(1);
		// Since JS dates have no timezone context, all dates are assumed to be UTC
		indvec[0] = SQL_NULL_DATA;
		if (!p->IsNull())
		{
			auto dateObject = Handle<Date>::Cast<Value>(p);
			assert(!dateObject.IsEmpty());
			// dates in JS are stored internally as ms count from Jan 1, 1970
			const auto d = dateObject->NumberValue();
			auto& ts = (*storage->timestampoffsetvec_ptr)[0];
			TimestampColumn sql_date(d, 0, offset);
			sql_date.ToTimestampOffset(ts);
			indvec[0] = buffer_len;
		}
	}

	void BoundDatum::reserve_time_stamp_offset(SQLLEN len)
	{
		buffer_len = sizeof(SQL_SS_TIMESTAMPOFFSET_STRUCT);
		storage->timestampoffsetvec_ptr = make_shared<vector<SQL_SS_TIMESTAMPOFFSET_STRUCT>>(len);
		indvec.resize(len);
		// Since JS dates have no timezone context, all dates are assumed to be UTC		
		js_type = JS_DATE;
		c_type = SQL_C_BINARY;
		// TODO: Determine proper SQL type based on version of server we're talking to
		sql_type = SQL_SS_TIMESTAMPOFFSET;
		buffer = storage->timestampoffsetvec_ptr->data();
		// TODO: Determine proper precision and size based on version of server we're talking to
		param_size = sql_server_2008_default_datetime_precision;
		if (digits <= 0) digits = sql_server_2008_default_datetime_scale;
	}

	void BoundDatum::bind_time_stamp_offset_array(const Local<Value>& p)
	{
		auto arr = Local<Array>::Cast(p);
		const auto len = arr->Length();
		reserve_time_stamp_offset(len);
		auto& vec = *storage->timestampoffsetvec_ptr;
		buffer_len = sizeof(SQL_SS_TIMESTAMPOFFSET_STRUCT);
		for (uint32_t i = 0; i < len; ++i)
		{
			indvec[i] = SQL_NULL_DATA;
			const auto elem = arr->Get(i);
			if (!elem->IsNull())
			{
				indvec[i] = sizeof(SQL_SS_TIMESTAMPOFFSET_STRUCT);
				const auto d = Handle<Date>::Cast<Value>(elem);
				auto& ts = vec[i];
				TimestampColumn sql_date(d->NumberValue());
				sql_date.ToTimestampOffset(ts);
			}
		}
	}

	void BoundDatum::bind_integer(const Local<Value>& p)
	{
		reserve_integer(1);
		auto& vec = *storage->int64vec_ptr;
		indvec[0] = SQL_NULL_DATA;
		if (!p->IsNull())
		{
			vec[0] = p->IntegerValue();
			indvec[0] = 0;
		}
	}

	void BoundDatum::reserve_integer(SQLLEN len)
	{
		const auto size = sizeof(int64_t);
		storage->ReserveInt64(len);
		indvec.resize(len);
		js_type = JS_NUMBER;
		c_type = SQL_C_SBIGINT;
		sql_type = SQL_BIGINT;
		buffer = storage->int64vec_ptr->data();
		buffer_len = size * len;
		param_size = size;
		digits = 0;
	}

	void BoundDatum::bind_integer_array(const Local<Value>& p)
	{
		auto arr = Local<Array>::Cast(p);
		const auto len = arr->Length();
		reserve_uint32(len);
		auto& vec = *storage->int64vec_ptr;
		for (uint32_t i = 0; i < len; ++i)
		{
			indvec[i] = SQL_NULL_DATA;
			const auto elem = arr->Get(i);
			if (!elem->IsNull())
			{
				indvec[i] = 0;
				vec[i] = elem->IntegerValue();
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
		auto& vec = *storage->doublevec_ptr;
		indvec[0] = SQL_NULL_DATA;
		if (!p->IsNull())
		{
			vec[0] = p->NumberValue();
			indvec[0] = 0;
		}
	}

	void BoundDatum::reserve_double(SQLLEN len)
	{
		const auto size = sizeof(double);
		storage->ReserveDouble(len);
		indvec.resize(len);
		js_type = JS_NUMBER;
		c_type = SQL_C_DOUBLE;
		sql_type = SQL_DOUBLE;
		buffer = storage->doublevec_ptr->data();
		buffer_len = size * len;
		param_size = size;
		digits = 0;
	}

	void BoundDatum::bind_double_array(const Local<Value>& p)
	{
		auto arr = Local<Array>::Cast(p);
		const auto len = arr->Length();
		reserve_double(len);
		auto& vec = *storage->doublevec_ptr;
		for (uint32_t i = 0; i < len; ++i)
		{
			indvec[i] = SQL_NULL_DATA;
			const auto elem = arr->Get(i);
			if (!elem->IsNull())
			{
				vec[i] = elem->NumberValue();
				indvec[i] = 0;
			}
		}
	}

	void BoundDatum::bind_number(const Local<Value>& p)
	{
		// numbers can be either integers or doubles.  We attempt to determine which it is through a simple
		// cast and equality check
		const auto d = p->NumberValue();
		if (d == floor(d) &&
			d >= numeric_limits<int64_t>::min() &&
			d <= numeric_limits<int64_t>::max())
		{
			bind_integer(p);
		}
		else
		{
			bind_double(p);
		}
	}

	void BoundDatum::bind_number_array(const Local<Value>& pp)
	{
		auto arr = Local<Array>::Cast(pp);
		const auto p = arr->Get(0);
		const auto d = p->NumberValue();
		if (d == floor(d) &&
			d >= numeric_limits<int64_t>::min() &&
			d <= numeric_limits<int64_t>::max())
		{
			bind_integer_array(pp);
		}
		else
		{
			bind_double_array(pp);
		}
	}

	bool BoundDatum::bind_datum_type(Local<Value>& p)
	{
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
			const auto d = p->NumberValue();
			if (_isnan(d) || !_finite(d))
			{
				err = "Invalid number parameter";
				return false;
			}
			bind_number(p);
		}
		else if (p->IsDate())
		{
			bind_time_stamp_offset(p);
		}
		else if (p->IsObject() && node::Buffer::HasInstance(p))
		{
			bind_var_binary(p);
		}
		else
		{
			err = "Invalid parameter type";
			return false;
		}

		return true;
	}

	static Local<Value> get(Local<Object> o, const char* v)
	{
		nodeTypeFactory fact;
		const auto vp = fact.newString(v);
		const auto val = o->Get(vp);
		return val;
	}

	static Local<String> getH(Local<Value> o, const char* v)
	{
		nodeTypeFactory fact;
		const auto vp = fact.newString(v);
		const auto val = o->ToObject()->Get(vp);
		return val->ToString();
	}

	bool BoundDatum::bind(Local<Object> o, const char* if_str, uint16_t type)
	{
		auto val = get(o, if_str);
		if (!val->IsUndefined())
		{
			param_type = type;
			return bind_datum_type(val);
		}
		return false;
	}

	bool is_numeric(wstring& v)
	{
		const auto res = v == L"numeric"
			|| v == L"decimal"
			|| v == L"smallmoney"
			|| v == L"money"
			|| v == L"float"
			|| v == L"real";
		return res;
	}

	bool is_int(const wstring& v)
	{
		const auto res = v == L"smallint"
			|| v == L"int"
			|| v == L"bigint"
			|| v == L"tinyint";
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

	bool isDate(const wstring& v)
	{
		const auto res = v == L"date"
			|| v == L"datetimeoffset"
			|| v == L"datetime2"
			|| v == L"smalldatetime"
			|| v == L"datetime"
			|| v == L"time";
		return res;
	}

	bool sql_type_s_maps_to_numeric(Local<Value> p)
	{
		const auto str = getH(p, "type_id");
		auto v = FromV8String(str);
		const auto res = is_numeric(v);
		return res;
	}

	bool sql_type_s_maps_to_u_int32(Local<Value> p)
	{
		const auto str = getH(p, "type_id");
		const auto v = FromV8String(str);
		const auto res = v == L"sbigint";
		return res;
	}

	bool sql_type_s_maps_to_int32(Local<Value> p)
	{
		const auto str = getH(p, "type_id");
		const auto v = FromV8String(str);
		const auto res = is_int(v);
		return res;
	}

	bool sql_type_s_maps_totring(Local<Value> p)
	{
		const auto str = getH(p, "type_id");
		const auto v = FromV8String(str);
		const auto res = is_string(v);
		return res;
	}

	bool sql_type_s_maps_to_boolean(Local<Value> p)
	{
		const auto str = getH(p, "type_id");
		const auto v = FromV8String(str);
		const auto res = is_bit(v);
		return res;
	}

	bool sql_type_s_maps_to_date(Local<Value> p)
	{
		const auto str = getH(p, "type_id");
		const auto v = FromV8String(str);
		const auto res = isDate(v);
		return res;
	}

	Local<Value> reserve_output_param(Local<Value> p, int size)
	{
		Local<Value> pval;
		nodeTypeFactory fact;

		if (sql_type_s_maps_to_int32(p))
		{
			pval = fact.newInt32(0);
		}
		else if (sql_type_s_maps_to_u_int32(p))
		{
			pval = fact.newUint32(0);
		}
		else if (sql_type_s_maps_to_boolean(p))
		{
			pval = fact.newInt32(0);
		}
		else if (sql_type_s_maps_to_numeric(p))
		{
			pval = fact.newNumber(0.0);
		}
		else if (sql_type_s_maps_to_date(p))
		{
			pval = fact.newDate();
		}
		else if (sql_type_s_maps_totring(p))
		{
			vector<char> b;
			b.resize(size);
			pval = fact.newString(b.data(), size);
		}
		else
		{
			pval = fact.newBuffer(size);
		}
		return pval;
	}

	bool BoundDatum::proc_bind(Local<Value>& p, Local<Value>& v)
	{
		const auto is_output = v->ToInteger();

		Local<Value> pval;
		const auto size = get(p->ToObject(), "max_length")->Int32Value();
		if (is_output->Int32Value() != 0)
		{
			param_type = SQL_PARAM_OUTPUT;
			pval = reserve_output_param(p, size);
		}
		else
		{
			param_type = SQL_PARAM_INPUT;
			pval = get(p->ToObject(), "val");
		}

		return bind_datum_type(pval);
	}

	void BoundDatum::assign_precision(Local<Object>& pv)
	{
		const auto precision = get(pv, "precision");
		if (!precision->IsUndefined())
		{
			param_size = precision->Int32Value();
		}

		const auto scale = get(pv, "scale");
		if (!scale->IsUndefined())
		{
			digits = scale->Int32Value();
		}

		const auto off = get(pv, "offset");
		if (!off->IsUndefined())
		{
			offset = off->Int32Value();
		}
	}

	bool BoundDatum::user_bind(Local<Value>& p, Local<Value>& v)
	{
		sql_type = v->Int32Value();
		param_type = SQL_PARAM_INPUT;

		auto pv = p->ToObject();
		auto pp = get(pv, "value");

		assign_precision(pv);

		switch (sql_type)
		{
		case SQL_LONGVARBINARY:
			bind_long_var_binary(pp);
			break;

		case SQL_VARBINARY:
			{
				if (pp->IsNull()
					|| (pp->IsObject() && node::Buffer::HasInstance(pp)))
				{
					bind_var_binary(pp);
				}
				else
				{
					err = "Invalid parameter type";
					return false;
				}
			}
			break;

		case SQL_INTEGER:
			bind_int32(pp);
			break;

		case SQL_WVARCHAR:
			bind_w_var_char(pp);
			break;

		case SQL_WLONGVARCHAR:
			bind_w_long_var_char(pp);
			break;

		case SQL_BIT:
			bind_boolean(pp);
			break;

		case SQL_BIGINT:
			bind_integer(pp);
			break;

		case SQL_DOUBLE:
			bind_double(pp);
			break;

		case SQL_FLOAT:
			bind_float(pp);
			break;

		case SQL_REAL:
			bind_real(pp);
			break;

		case SQL_TINYINT:
			bind_tiny_int(pp);
			break;

		case SQL_SMALLINT:
			bind_small_int(pp);
			break;

		case SQL_NUMERIC:
			bind_numeric(pp);
			break;

		case SQL_CHAR:
			bind_char(pp);
			break;

		case SQL_VARCHAR:
			bind_var_char(pp);
			break;

		case SQL_SS_TIME2:
			bind_time(pp);
			break;

		case SQL_TYPE_DATE:
			bind_date(pp);
			break;

		case SQL_TYPE_TIMESTAMP:
			bind_time_stamp(pp);
			break;

		case SQL_SS_TIMESTAMPOFFSET:
			bind_time_stamp_offset(pp);
			break;

		default:
			return false;
		}

		return true;
	}

	bool BoundDatum::bind_object(Local<Value>& p)
	{
		const auto po = p->ToObject();

		auto v = get(po, "is_output");
		if (!v->IsUndefined())
		{
			return proc_bind(p, v);
		}

		v = get(po, "sql_type");
		if (!v->IsUndefined())
		{
			return user_bind(p, v);
		}

		return false;
	}

	bool BoundDatum::bind_array(Local<Value>& pp)
	{
		auto arr = Local<Array>::Cast(pp);
		nodeTypeCounter counts;

		for (uint32_t i = 0; i < arr->Length(); ++i)
		{
			const auto p = arr->Get(i);
			counts.Decode(p);
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
			err = "Invalid number parameter";
			return false;
		}
		else if (counts.numberCount > 0)
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
		else if (counts.nullCount == arr->Length())
		{
			bind_null_array(pp);
		}
		else
		{
			err = "Invalid parameter type";
			return false;
		}

		return true;
	}

	Handle<Value> BoundDatum::unbind_null()
	{
		nodeTypeFactory fact;
		return fact.null();
	}

	Handle<Value> BoundDatum::unbind_string() const
	{
		nodeTypeFactory fact;
		const auto s = fact.fromTwoByte(storage->uint16vec_ptr->data());
		return s;
	}

	Handle<Value> BoundDatum::unbind_double() const
	{
		nodeTypeFactory fact;
		auto& vec = *storage->doublevec_ptr;
		const auto s = fact.newNumber(vec[0]);
		return s;
	}

	Handle<Value> BoundDatum::unbind_boolean() const
	{
		nodeTypeFactory fact;
		auto& vec = *storage->uint16vec_ptr;
		const auto s = fact.newBoolean(vec[0]);
		return s;
	}

	Handle<Value> BoundDatum::unbind_int32() const
	{
		nodeTypeFactory fact;
		auto& vec = *storage->int32vec_ptr;
		const auto s = fact.newInt32(vec[0]);
		return s;
	}

	Handle<Value> BoundDatum::unbind_uint32() const
	{
		nodeTypeFactory fact;
		auto& vec = *storage->uint32vec_ptr;
		const auto s = fact.newUint32(vec[0]);
		return s;
	}

	Handle<Value> BoundDatum::unbind_number() const
	{
		Handle<Value> v;
		if (sql_type == SQL_C_DOUBLE)
		{
			v = unbind_double();
		}
		else
		{
			nodeTypeFactory fact;
			auto& vec = *storage->int64vec_ptr;
			v = fact.newInt64(vec[0]);
		}
		return v;
	}

	Handle<Value> BoundDatum::unbind_date() const
	{
		auto& vec = *storage->timestampoffsetvec_ptr;
		TimestampColumn tsc(vec[0]);
		return tsc.ToValue();
	}

	void BoundDatum::reserve_column_type(SQLSMALLINT type, size_t len)
	{
		switch (type)
		{
		case SQL_SS_VARIANT:
			reserve_var_char(len);
			break;

		case SQL_CHAR:
		case SQL_VARCHAR:
		case SQL_LONGVARCHAR:
		case SQL_WCHAR:
		case SQL_WVARCHAR:
		case SQL_WLONGVARCHAR:
		case SQL_SS_XML:
		case SQL_GUID:
			reserve_w_var_char_array(len + 1, 1);
			break;

		case SQL_BIT:
			reserve_boolean(1);
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
			reserve_integer(1);
			break;

		case SQL_DECIMAL:
		case SQL_NUMERIC:
		case SQL_REAL:
		case SQL_FLOAT:
		case SQL_DOUBLE:
		case SQL_BIGINT:
			reserve_double(1);
			break;

		case SQL_BINARY:
		case SQL_VARBINARY:
		case SQL_LONGVARBINARY:
		case SQL_SS_UDT:
			reserve_var_binary_array(len, 1);
			break;

		case SQL_SS_TIMESTAMPOFFSET:
			reserve_time_stamp_offset(1);
			break;

		case SQL_TYPE_TIME:
		case SQL_SS_TIME2:
			reserve_time(1);
			break;

		case SQL_TIMESTAMP:
		case SQL_DATETIME:
		case SQL_TYPE_TIMESTAMP:
		case SQL_TYPE_DATE:
			reserve_time_stamp(1);
			break;

		default:
			reserve_var_char(len);
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
