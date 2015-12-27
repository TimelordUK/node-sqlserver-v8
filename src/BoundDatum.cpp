#include "stdafx.h"
#include "BoundDatum.h"
#include <TimestampColumn.h>
#include <limits>

namespace mssql
{
	const int SQL_SERVER_2008_DEFAULT_DATETIME_PRECISION = 34;
	const int SQL_SERVER_2008_DEFAULT_DATETIME_SCALE = 7;

	bool BoundDatum::bind(Local<Value> & p)
	{
		bool res = false;
		if (p->IsArray()) {
			res = bindArray(p);
		}
		else if (p->IsObject()) {
			res = bindObject(p);
		}
		if (!res) res = bindDatumType(p);
		return res;
	}

	void BoundDatum::bindNull(const Local<Value> & p)
	{
		bindNull(1);
		indvec[0] = SQL_NULL_DATA;
	}

	void BoundDatum::bindNullArray(const Local<Value> & p)
	{
		auto arr = Local<Array>::Cast(p);
		auto len = arr->Length();
		bindNull(len);
		for (uint32_t i = 0; i < len; ++i)
		{
			indvec[i] = SQL_NULL_DATA;
		}
	}

	void BoundDatum::bindNull(SQLLEN len)
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

	void BoundDatum::bindString(const Local<Value> & p)
	{
		auto str_param = p->ToString();
		bindString(p, str_param->Length());
	}

	void BoundDatum::bindString(const Local<Value> & p, int str_len)
	{
		js_type = JS_STRING;
		c_type = SQL_C_WCHAR;
		sql_type = SQL_WVARCHAR;

		indvec[0] = SQL_NULL_DATA;
		if (!p->IsNull()) {
			auto str_param = p->ToString();
			uint16vec_ptr = make_shared<vector<uint16_t>>(str_len + 1);
			auto first_p = uint16vec_ptr->data();
			buffer = first_p;
			str_param->Write(first_p);
			if (str_len > 4000) {
				param_size = 0; // max types require 0 precision
			}
			else {
				param_size = str_len;
			}
			buffer_len = str_len * sizeof(uint16_t);
			indvec[0] = buffer_len;
		}
	}

	int getMaxStrLen(const Local<Value> & p)
	{
		int strLen = 0;
		auto arr = Local<Array>::Cast(p);
		auto len = arr->Length();
		for (uint32_t i = 0; i < len; ++i)
		{
			auto str = arr->Get(i)->ToString();
			if (str->Length() > strLen) strLen = str->Length();
		}
		return strLen;
	}

	size_t getMaxObjectLen(const Local<Value> & p)
	{
		size_t strLen = 0;
		auto arr = Local<Array>::Cast(p);
		auto len = arr->Length();
		for (uint32_t i = 0; i < len; ++i)
		{
			auto o = arr->Get(i)->ToObject();
			auto width = node::Buffer::Length(o);
			if (width > strLen) strLen = width;
		}
		return strLen;
	}

	void BoundDatum::bindDefaultArray(const Local<Value> & p)
	{
		auto arr = Local<Array>::Cast(p);
		auto len = arr->Length();

		js_type = JS_BUFFER;
		c_type = SQL_C_BINARY;
		sql_type = SQL_VARBINARY;
		digits = 0;

		size_t objLen = getMaxObjectLen(p);
		charvec_ptr = make_shared<vector<char>>(len * objLen);
		indvec.resize(len);
		buffer = charvec_ptr->data();
		buffer_len = objLen;
		param_size = objLen;
		auto itr = charvec_ptr->begin();

		for (uint32_t i = 0; i < len; ++i)
		{
			indvec[i] = SQL_NULL_DATA;
			auto elem = arr->Get(i);
			if (!elem->IsNull()) {
				auto o = elem->ToObject();
				auto ptr = node::Buffer::Data(o);
				auto width = node::Buffer::Length(o);
				indvec[i] = width;
				memcpy(&*itr, ptr, width);
			}
			itr += objLen;
		}
	}

	void BoundDatum::bindStringArray(const Local<Value> & p)
	{
		js_type = JS_STRING;
		c_type = SQL_C_WCHAR;
		sql_type = SQL_WVARCHAR;

		int strLen = getMaxStrLen(p);
		auto arr = Local<Array>::Cast(p);
		auto len = arr->Length();

		indvec.resize(len);
		uint16vec_ptr = make_shared<vector<uint16_t>>(len * (strLen + 5));
		buffer = uint16vec_ptr->data();
		buffer_len = strLen * sizeof(uint16_t);
		param_size = strLen;

		auto itr = uint16vec_ptr->begin();
		for (uint32_t i = 0; i < len; ++i)
		{
			indvec[i] = SQL_NULL_DATA;
			auto elem = arr->Get(i);
			if (!elem->IsNull()) {
				auto str = arr->Get(i)->ToString();
				auto width = str->Length() * sizeof(uint16_t);
				indvec[i] = width;
				str->Write(&*itr);
			}
			itr += strLen;
		}
	}

	void BoundDatum::bindBoolean(const Local<Value> & p)
	{
		bindBoolean(1);
		auto & vec = *charvec_ptr;
		indvec[0] = SQL_NULL_DATA;
		if (!p->IsNull()) {
			vec[0] = p->BooleanValue() == false ? 0 : 1;
			indvec[0] = 0;
		}
	}

	void BoundDatum::bindBooleanArray(const Local<Value> & p)
	{
		auto arr = Local<Array>::Cast(p);
		auto len = arr->Length();
		bindBoolean(len);
		auto & vec = *charvec_ptr;
		for (uint32_t i = 0; i < len; ++i)
		{
			indvec[i] = SQL_NULL_DATA;
			auto elem = arr->Get(i);
			if (!elem->IsNull()) {
				auto b = elem->BooleanValue() == false ? 0 : 1;
				vec[i] = b;
				indvec[i] = 0;
			}
		}
	}

	void BoundDatum::bindBoolean(SQLLEN len)
	{
		buffer_len = len * sizeof(char);
		charvec_ptr = make_shared<vector<char>>(len);
		indvec.resize(len);
		js_type = JS_BOOLEAN;
		c_type = SQL_C_BIT;
		sql_type = SQL_BIT;
		buffer = charvec_ptr->data();
		param_size = sizeof(char);;
		digits = 0;
	}

	void BoundDatum::bindInt32(const Local<Value> & p)
	{
		bindInt32(1);
		indvec[0] = SQL_NULL_DATA;
		auto & vec = *int32vec_ptr;
		vec[0] = SQL_NULL_DATA;
		if (!p->IsNull()) {
			vec[0] = p->Int32Value();
			indvec[0] = 0;
		}
	}

	void BoundDatum::bindInt32Array(const Local<Value>& p)
	{
		auto arr = Local<Array>::Cast(p);
		int len = arr->Length();
		bindInt32(len);
		auto & vec = *int32vec_ptr;
		for (int i = 0; i < len; ++i)
		{
			indvec[i] = SQL_NULL_DATA;
			auto elem = arr->Get(i);
			if (!elem->IsNull()) {
				vec[i] = elem->Int32Value();
				indvec[i] = 0;
			}
		}
	}

	void BoundDatum::bindInt32(SQLLEN len)
	{
		buffer_len = len * sizeof(int32_t);
		int32vec_ptr = make_shared<vector<int32_t>>(len);
		indvec.resize(len);
		js_type = JS_INT;
		c_type = SQL_C_SLONG;
		sql_type = SQL_INTEGER;
		buffer = int32vec_ptr->data();
		param_size = sizeof(int32_t);
		digits = 0;
	}

	void BoundDatum::bindUint32(const Local<Value> & p)
	{
		bindUint32(1);
		auto & vec = *uint32vec_ptr;
		indvec[0] = SQL_NULL_DATA;
		if (!p->IsNull()) {
			vec[0] = p->Uint32Value();
			indvec[0] = 0;
		}
	}

	void BoundDatum::bindUint32Array(const Local<Value>& p)
	{
		auto arr = Local<Array>::Cast(p);
		auto len = arr->Length();
		bindUint32(len);
		auto & vec = *uint32vec_ptr;
		for (uint32_t i = 0; i < len; ++i)
		{
			indvec[i] = SQL_NULL_DATA;
			auto elem = arr->Get(i);
			if (!elem->IsNull()) {
				vec[i] = elem->Uint32Value();
				indvec[i] = 0;
			}
		}
	}

	void BoundDatum::bindUint32(SQLLEN len)
	{
		buffer_len = len * sizeof(uint32_t);
		uint32vec_ptr = make_shared<vector<uint32_t>>(len);
		indvec.resize(len);
		js_type = JS_UINT;
		c_type = SQL_C_ULONG;
		sql_type = SQL_BIGINT;
		buffer = uint32vec_ptr->data();
		param_size = sizeof(uint32_t);
		digits = 0;
	}

	void BoundDatum::bindDate(const Local<Value> & p)
	{
		bindDate(1);
		// Since JS dates have no timezone context, all dates are assumed to be UTC
		indvec[0] = SQL_NULL_DATA;
		if (!p->IsNull()) {
			auto dateObject = Handle<Date>::Cast<Value>(p);
			assert(!dateObject.IsEmpty());
			// dates in JS are stored internally as ms count from Jan 1, 1970
			double d = dateObject->NumberValue();
			auto & ts = (*timevec_ptr)[0];
			TimestampColumn sql_date(d);
			sql_date.ToTimestampOffset(ts);
			indvec[0] = buffer_len;
		}
	}

	void BoundDatum::bindDate(SQLLEN len)
	{
		buffer_len = sizeof(SQL_SS_TIMESTAMPOFFSET_STRUCT);
		timevec_ptr = make_shared<vector<SQL_SS_TIMESTAMPOFFSET_STRUCT>>(len);
		indvec.resize(len);
		// Since JS dates have no timezone context, all dates are assumed to be UTC		
		js_type = JS_DATE;
		c_type = SQL_C_BINARY;
		// TODO: Determine proper SQL type based on version of server we're talking to
		sql_type = SQL_SS_TIMESTAMPOFFSET;
		buffer = timevec_ptr->data();
		// TODO: Determine proper precision and size based on version of server we're talking to
		param_size = SQL_SERVER_2008_DEFAULT_DATETIME_PRECISION;
		digits = SQL_SERVER_2008_DEFAULT_DATETIME_SCALE;
	}

	void BoundDatum::bindDateArray(const Local<Value>& p)
	{
		auto arr = Local<Array>::Cast(p);
		auto len = arr->Length();
		bindDate(len);
		auto & vec = *timevec_ptr;
		buffer_len = sizeof(SQL_SS_TIMESTAMPOFFSET_STRUCT);
		for (uint32_t i = 0; i < len; ++i)
		{
			indvec[i] = SQL_NULL_DATA;
			auto elem = arr->Get(i);
			if (!elem->IsNull()) {
				indvec[i] = sizeof(SQL_SS_TIMESTAMPOFFSET_STRUCT);
				auto d = Handle<Date>::Cast<Value>(elem);
				auto & ts = vec[i];
				TimestampColumn sql_date(d->NumberValue());
				sql_date.ToTimestampOffset(ts);
			}
		}
	}

	void BoundDatum::bindInteger(const Local<Value> & p)
	{
		bindInteger(1);
		auto & vec = *int64vec_ptr;
		indvec[0] = SQL_NULL_DATA;
		if (!p->IsNull()) {
			vec[0] = p->IntegerValue();
			indvec[0] = 0;
		}
	}

	void BoundDatum::bindInteger(SQLLEN len)
	{
		int64vec_ptr = make_shared<vector<int64_t>>(len);
		indvec.resize(len);
		js_type = JS_NUMBER;
		c_type = SQL_C_SBIGINT;
		sql_type = SQL_BIGINT;
		buffer = int64vec_ptr->data();
		buffer_len = sizeof(int64_t) * len;
		param_size = sizeof(int64_t);
		digits = 0;
	}

	void BoundDatum::bindIntegerArray(const Local<Value>& p)
	{
		auto arr = Local<Array>::Cast(p);
		auto len = arr->Length();
		bindUint32(len);
		auto & vec = *int64vec_ptr;
		for (uint32_t i = 0; i < len; ++i)
		{
			indvec[i] = SQL_NULL_DATA;
			auto elem = arr->Get(i);
			if (!elem->IsNull()) {
				indvec[i] = 0;
				vec[i] = elem->IntegerValue();
			}
		}
	}

	void BoundDatum::bindDouble(const Local<Value> & p)
	{
		bindDouble(1);
		auto & vec = *doublevec_ptr;
		indvec[0] = SQL_NULL_DATA;
		if (!p->IsNull()) {
			vec[0] = p->NumberValue();
			indvec[0] = 0;
		}
	}

	void BoundDatum::bindDouble(SQLLEN len)
	{
		buffer_len = len * sizeof(int32_t);
		doublevec_ptr = make_shared<vector<double>>(len);
		indvec.resize(len);
		js_type = JS_NUMBER;
		c_type = SQL_C_DOUBLE;
		sql_type = SQL_DOUBLE;
		buffer = doublevec_ptr->data();
		buffer_len = sizeof(double) * len;
		param_size = sizeof(double);
		digits = 0;
	}

	void BoundDatum::bindDoubleArray(const Local<Value>& p)
	{
		auto arr = Local<Array>::Cast(p);
		auto len = arr->Length();
		bindDouble(len);
		auto & vec = *doublevec_ptr;
		for (uint32_t i = 0; i < len; ++i)
		{
			indvec[i] = SQL_NULL_DATA;
			auto elem = arr->Get(i);
			if (!elem->IsNull()) {
				vec[i] = elem->NumberValue();
				indvec[i] = 0;
			}
		}
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

	void BoundDatum::bindNumberArray(const Local<Value> & pp)
	{
		auto arr = Local<Array>::Cast(pp);
		auto p = arr->Get(0);
		double d = p->NumberValue();
		if (d == floor(d) &&
			d >= numeric_limits<int64_t>::min() &&
			d <= numeric_limits<int64_t>::max()) {
			bindIntegerArray(pp);
		}
		else {
			bindDoubleArray(pp);
		}
	}

	void BoundDatum::bindDefault(Local<Value> & p)
	{
		// TODO: Determine if we need something to keep the Buffer object from going
		// away while we use it we could just copy the data, but with buffers being 
		// potentially very large, that could be problematic

		auto o = p.As<Object>();

		indvec[0] = SQL_NULL_DATA;
		if (!o->IsNull()) {
			buffer = node::Buffer::Data(o);
			buffer_len = node::Buffer::Length(o);
			param_size = buffer_len;
			indvec[0] = buffer_len;
		}

		js_type = JS_BUFFER;
		c_type = SQL_C_BINARY;
		sql_type = SQL_VARBINARY;
		digits = 0;
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
			err = "Invalid parameter type";
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

	bool BoundDatum::procBind(Local<Value> &p, Local<Value> &v)
	{
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

		return bindDatumType(pval);
	}

	bool BoundDatum::userBind(Local<Value> &p, Local<Value> &v)
	{
		auto sqlType = v->Int32Value();
		auto res = true;

		switch (sqlType)
		{

		case SQL_VARBINARY:
		{
			auto b = get(p->ToObject(), "value");
			bindDefault(b);
		}
		break;

		case SQL_INTEGER:
		{
			auto i = get(p->ToObject(), "value");
			bindInt32(i);
		}
		break;

		case SQL_WVARCHAR:
		{
			auto s = get(p->ToObject(), "value");
			bindString(s);
		}
		break;

		case SQL_SS_TIMESTAMPOFFSET:
		{
			auto d = get(p->ToObject(), "value");
			bindDate(d);
		}
		break;

		case SQL_BIT:
		{
			auto b = get(p->ToObject(), "value");
			bindBoolean(b);
		}
		break;

		case SQL_BIGINT:
		{
			auto i = get(p->ToObject(), "value");
			bindInteger(i);
		}
		break;

		case SQL_DOUBLE:
		{
			auto d = get(p->ToObject(), "value");
			bindDouble(d);
		}
		break;

		default:
			res = false;
			break;
		}

		return res;
	}

	bool BoundDatum::bindObject(Local<Value> &p)
	{
		auto v = get(p->ToObject(), "is_output");
		if (!v->IsUndefined()) {
			return procBind(p, v);
		}

		v = get(p->ToObject(), "sql_type");
		if (!v->IsUndefined())
		{
			return userBind(p, v);
		}

		return false;
	}

	bool BoundDatum::bindArray(Local<Value> & pp)
	{
		auto arr = Local<Array>::Cast(pp);
		nodeTypeCounter counts;

		for (uint32_t i = 0; i < arr->Length(); ++i)
		{
			auto p = arr->Get(i);
			counts.Decode(p);
		}

		if (counts.boolCount != 0)
		{
			bindBooleanArray(pp);
		}
		else if (counts.stringCount != 0)
		{
			bindStringArray(pp);
		}
		else if (counts.dateCount != 0)
		{
			bindDateArray(pp);
		}
		else if (counts.bufferCount != 0)
		{
			bindDefaultArray(pp);
		}
		else if (counts.getoutBoundsCount() > 0) {
			err = "Invalid number parameter";
			return false;
		}
		else if (counts.numberCount > 0)
		{
			bindDoubleArray(pp);
		}
		else if (counts.int64Count > 0) {
			bindIntegerArray(pp);
		}
		else if (counts.int32Count != 0)
		{
			bindInt32Array(pp);
		}
		else if (counts.uint32Count != 0)
		{
			bindUint32Array(pp);
		}
		else if (counts.nullCount == arr->Length())
		{
			bindNullArray(pp);
		}
		else {
			err = "Invalid parameter type";
			return false;
		}

		return true;
	}

	Handle<Value> BoundDatum::unbindNull()
	{
		nodeTypeFactory fact;
		return fact.null();
	}

	Handle<Value> BoundDatum::unbindString() const
	{
		nodeTypeFactory fact;
		auto s = fact.fromTwoByte(uint16vec_ptr->data());
		return s;
	}

	Handle<Value> BoundDatum::unbindDouble() const
	{
		nodeTypeFactory fact;
		auto s = fact.newNumber(*doublevec_ptr->data());
		return s;
	}

	Handle<Value> BoundDatum::unbindBoolean() const
	{
		nodeTypeFactory fact;
		auto s = fact.newBoolean(*uint16vec_ptr->data());
		return s;
	}

	Handle<Value> BoundDatum::unbindInt32() const
	{
		nodeTypeFactory fact;
		auto s = fact.newInt32(*int32vec_ptr->data());
		return s;
	}

	Handle<Value> BoundDatum::unbindUint32() const
	{
		nodeTypeFactory fact;
		auto s = fact.newUint32(*uint32vec_ptr->data());
		return s;
	}

	Handle<Value> BoundDatum::unbindNumber() const
	{
		Handle<Value> v;
		if (sql_type == SQL_C_DOUBLE) {
			v = unbindDouble();
		}
		else {
			nodeTypeFactory fact;
			v = fact.newInt64(*int64vec_ptr->data());
		}
		return v;
	}

	Handle<Value> BoundDatum::unbindDate() const
	{
		TimestampColumn tsc(*timevec_ptr->data());
		return tsc.ToValue();
	}

	Local<Value> BoundDatum::unbind() const
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