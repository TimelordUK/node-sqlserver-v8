#include "stdafx.h"
#include "BoundDatum.h"
#include <TimestampColumn.h>
#include <limits>

// undo these tokens to use numeric_limits below
#undef min
#undef max

namespace mssql
{
	const int SQL_SERVER_2008_DEFAULT_DATETIME_PRECISION = 34;
	const int SQL_SERVER_2008_DEFAULT_DATETIME_SCALE = 7;

	void BoundDatum::bindNull(const Local<Value> & p)
	{
		js_type = JS_NULL;
		c_type = SQL_C_CHAR;
		sql_type = SQL_CHAR;
		param_size = 1;
		digits = 0;
		buffer = nullptr;
		buffer_len = 0;
		indptr = SQL_NULL_DATA;
	}

	void BoundDatum::bindString(const Local<Value> & p)
	{
		auto str_param = p->ToString();
		int str_len = str_param->Length();
		bindString(p, str_len);
	}

	void BoundDatum::bindString(const Local<Value> & p, int str_len)
	{
		js_type = BoundDatum::JS_STRING;
		c_type = SQL_C_WCHAR;
		sql_type = SQL_WVARCHAR;
		auto str_param = p->ToString();
		vec_ptr = make_shared<vector<uint16_t>>(str_len + 1);
		auto first_p = (*vec_ptr).data();
		buffer = first_p;   // null terminator
		str_param->Write(first_p);
		if (str_len > 4000) {
			param_size = 0;     // max types require 0 precision
		}
		else {
			param_size = str_len;
		}
		buffer_len = str_len * sizeof(uint16_t);
		digits = 0;
		indptr = buffer_len;
	}

	void BoundDatum::bindBoolean(const Local<Value> & p)
	{
		uint16_ptr = make_shared<uint16_t>(p->BooleanValue());
		js_type = JS_BOOLEAN;
		c_type = SQL_C_BIT;
		sql_type = SQL_BIT;
		buffer = uint16_ptr.get();
		buffer_len = sizeof(uint16_t);
		param_size = 1;
		digits = 0;
		indptr = buffer_len;
	}

	void BoundDatum::bindInt32(const Local<Value> & p)
	{
		int32_ptr = make_shared<int32_t>(p->Int32Value());
		js_type = JS_INT;
		c_type = SQL_C_SLONG;
		sql_type = SQL_INTEGER;
		buffer = int32_ptr.get();
		buffer_len = sizeof(int32_t);
		param_size = sizeof(int32_t);
		digits = 0;
		indptr = buffer_len;
	}

	void BoundDatum::bindUint32(const Local<Value> & p)
	{
		uint32_ptr = make_shared<uint32_t>(p->Uint32Value());
		js_type = JS_UINT;
		c_type = SQL_C_ULONG;
		sql_type = SQL_BIGINT;
		buffer = uint32_ptr.get();
		buffer_len = sizeof(uint32_t);
		param_size = sizeof(uint32_t);
		digits = 0;
		indptr = buffer_len;
	}

	void BoundDatum::bindDate(const Local<Value> & p)
	{
		// Since JS dates have no timezone context, all dates are assumed to be UTC
		auto dateObject = Handle<Date>::Cast<Value>(p);
		assert(!dateObject.IsEmpty());
		// dates in JS are stored internally as ms count from Jan 1, 1970
		double d = dateObject->NumberValue();
		time_ptr = make_shared<SQL_SS_TIMESTAMPOFFSET_STRUCT>();
		TimestampColumn sql_date(d);
		sql_date.ToTimestampOffset(*time_ptr);

		js_type = JS_DATE;
		c_type = SQL_C_BINARY;
		// TODO: Determine proper SQL type based on version of server we're talking to
		sql_type = SQL_SS_TIMESTAMPOFFSET;
		buffer = time_ptr.get();
		buffer_len = sizeof(SQL_SS_TIMESTAMPOFFSET_STRUCT);
		// TODO: Determine proper precision and size based on version of server we're talking to
		param_size = SQL_SERVER_2008_DEFAULT_DATETIME_PRECISION;
		digits = SQL_SERVER_2008_DEFAULT_DATETIME_SCALE;
		indptr = buffer_len;
	}

	void BoundDatum::bindInteger(const Local<Value> & p)
	{
		int64_t_ptr = make_shared<int64_t>(p->IntegerValue());
		js_type = JS_NUMBER;
		c_type = SQL_C_SBIGINT;
		sql_type = SQL_BIGINT;
		buffer = int64_t_ptr.get();
		buffer_len = sizeof(int64_t);
		param_size = sizeof(int64_t);
		digits = 0;
		indptr = buffer_len;
	}

	void BoundDatum::bindDouble(const Local<Value> & p)
	{
		double_ptr = make_shared<double>(p->NumberValue());
		js_type = JS_NUMBER;
		c_type = SQL_C_DOUBLE;
		sql_type = SQL_DOUBLE;
		buffer = double_ptr.get();
		buffer_len = sizeof(double);
		param_size = sizeof(double);
		digits = 0;
		indptr = buffer_len;
	}

	void BoundDatum::bindNumber(const Local<Value> & p)
	{
		// numbers can be either integers or doubles.  We attempt to determine which it is through a simple
		// cast and equality check
		double d = p->NumberValue();
		if (d == floor(d) &&
			d >= numeric_limits<int64_t>::min() &&
			d <= numeric_limits<int64_t>::max()) {
			bindInteger(p);
		}
		else {
			bindDouble(p);
		}
	}

	void BoundDatum::bindDefault(Local<Value> & p)
	{
		// TODO: Determine if we need something to keep the Buffer object from going
		// away while we use it we could just copy the data, but with buffers being 
		// potentially very large, that could be problematic
		auto o = p.As<Object>();

		js_type = JS_BUFFER;
		c_type = SQL_C_BINARY;
		sql_type = SQL_VARBINARY;
		buffer = node::Buffer::Data(o);
		buffer_len = node::Buffer::Length(o);
		param_size = buffer_len;
		digits = 0;
		indptr = buffer_len;
	}

	bool BoundDatum::bindDatumType(Local<Value> & p)
	{
		if (p->IsNull()) {
			bindNull(p);
		}
		else if (p->IsString()) {
			bindString(p);
		}
		else if (p->IsBoolean()) {
			bindBoolean(p);
		}
		else if (p->IsInt32()) {
			bindInt32(p);
		}
		else if (p->IsUint32()) {
			bindUint32(p);
		}
		else if (p->IsNumber()) {
			double d = p->NumberValue();
			if (_isnan(d) || !_finite(d)) {
				err = "Invalid number parameter";
				return false;
			}
			bindNumber(p);
		}
		else if (p->IsDate()) {
			bindDate(p);
		}
		else if (p->IsObject() && node::Buffer::HasInstance(p)) {
			bindDefault(p);
		}
		else {
			err =  "Invalid parameter type";
			return false;
		}

		return true;
	}
	
	static Local<Value> get(Local<Object> o, const char *v)
	{
		nodeTypeFactory fact;
		auto vp = fact.newString(v);
		auto val = o->Get(vp);
		return val;
	}

	static Local<String> getH(Local<Value> o, const char *v)
	{
		nodeTypeFactory fact;
		auto vp = fact.newString(v);
		auto val = o->ToObject()->Get(vp);
		return val->ToString();
	}

	bool BoundDatum::bind(Local<Object> o, const char * if_str, uint16_t type)
	{
		auto val = get(o, if_str);
		if (!val->IsUndefined())
		{
			param_type = type;
			return bindDatumType(val);
		}
		return false;
	}

	bool SqlTypeSMapsToNumeric(Local<Value> p)
	{
		auto str = getH(p, "type_id");
		auto v = FromV8String(str);
		bool res = v == L"numeric" || v == L"decimal" || v == L"smallmoney" || v == L"money" || v == L"float" || v == L"real";
		return res;
	}

	bool SqlTypeSMapsToUInt32(Local<Value> p)
	{
		auto str = getH(p, "type_id");
		auto v = FromV8String(str);
		bool res = v == L"sbigint";
		return res;
	}

	bool SqlTypeSMapsToInt32(Local<Value> p)
	{
		auto str = getH(p, "type_id");
		auto v = FromV8String(str);
		bool res = v == L"smallint" || v == L"int" || v == L"tinyint";
		return res;
	}

	bool SqlTypeSMapsTotring(Local<Value> p)
	{
		auto str = getH(p, "type_id");
		auto v = FromV8String(str);
		bool res = v == L"char" || v == L"text" || v == L"varchar";
		return res;
	}

	bool SqlTypeSMapsToBoolean(Local<Value> p)
	{
		auto str = getH(p, "type_id");
		auto v = FromV8String(str);
		bool res = v == L"bit";
		return res;
	}

	bool SqlTypeSMapsToDate(Local<Value> p)
	{
		auto str = getH(p, "type_id");
		auto v = FromV8String(str);
		bool res = v == L"date" || v == L"datetimeoffset" || v == L"datetime2" || v == L"smalldatetime" || v == L"datetime" || v == L"time";
		return res;
	}

	Local<Value> reserveOutputParam(Local<Value> p, int size)
	{
		Local<Value> pval;
		nodeTypeFactory fact;

		if (SqlTypeSMapsToInt32(p))
		{
			pval = fact.newInt32(0);
		}
		else if (SqlTypeSMapsToUInt32(p))
		{
			pval = fact.newUint32(0);
		}
		else if (SqlTypeSMapsToBoolean(p))
		{
			pval = fact.newInt32(0);
		}
		else if (SqlTypeSMapsToNumeric(p))
		{
			pval = fact.newNumber(0.0);
		}
		else if (SqlTypeSMapsToDate(p))
		{
			pval = fact.newDate();
		}
		else if (SqlTypeSMapsTotring(p))
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

	bool BoundDatum::bindObject(Local<Value> &p)
	{
		Local<Value> v = get(p->ToObject(), "is_output");
		if (v->IsUndefined()) return false;
		auto isOutput = v->ToInt32();
		Local<Value> pval;
		int size;
		size = get(p->ToObject(), "max_length")->Int32Value();
		if (isOutput->Int32Value() != 0)
		{
			param_type = SQL_PARAM_OUTPUT;
			pval = reserveOutputParam(p, size);
		}
		else
		{
			param_type = SQL_PARAM_INPUT;
			pval = get(p->ToObject(), "val");
		}

		bindDatumType(pval);

		return true;
	}

	bool BoundDatum::bind(Local<Value> & p)
	{
		bool res = false;
		if (p->IsObject()) {
			res = bindObject(p);
		}
		if (!res) res = bindDatumType(p);
		return res;
	}

	Handle<Value> BoundDatum::unbindNull()
	{
		nodeTypeFactory fact;
		return fact.null();
	}

	Handle<Value> BoundDatum::unbindString()
	{
		nodeTypeFactory fact;
		auto s = fact.fromTwoByte(vec_ptr->data());
		return s;
	}

	Handle<Value> BoundDatum::unbindDouble()
	{
		nodeTypeFactory fact;
		auto s = fact.newNumber(*double_ptr);
		return s;
	}

	Handle<Value> BoundDatum::unbindBoolean()
	{
		nodeTypeFactory fact;
		auto s = fact.newBoolean(*uint16_ptr);
		return s;
	}

	Handle<Value> BoundDatum::unbindInt32()
	{
		nodeTypeFactory fact;
		auto s = fact.newInt32(*int32_ptr);
		return s;
	}

	Handle<Value> BoundDatum::unbindUint32()
	{
		nodeTypeFactory fact;
		auto s = fact.newUint32(*uint32_ptr);
		return s;
	}

	Handle<Value> BoundDatum::unbindNumber()
	{
		Handle<Value> v;
		if (sql_type == SQL_C_DOUBLE) {
			v = unbindDouble();
		}
		else {
			nodeTypeFactory fact;
			v = fact.newInt64(*int64_t_ptr);
		}
		return v;
	}

	Handle<Value> BoundDatum::unbindDate()
	{
		TimestampColumn tsc(*time_ptr.get());
		return tsc.ToValue();
	}

	Local<Value> BoundDatum::unbind()
	{
		Local<Value> v;

		switch (js_type)
		{
		case JS_STRING:
			v = unbindString();
			break;

		case JS_BOOLEAN:
			v = unbindBoolean();
			break;

		case JS_INT:
			v = unbindInt32();
			break;

		case JS_UINT:
			v = unbindUint32();
			break;

		case JS_DATE:
			v = unbindDate();
			break;

		case JS_NUMBER:
			v = unbindNumber();
			break;

		default:
			v = unbindNull();
			break;
		}

		return v;
	}
}