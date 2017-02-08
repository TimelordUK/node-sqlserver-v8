
#include <TimestampColumn.h>
#include "BoundDatum.h"

namespace mssql
{
	const int SQL_SERVER_2008_DEFAULT_TIME_PRECISION = 16;
	const int SQL_SERVER_2008_DEFAULT_DATETIME_PRECISION = 34;
	const int SQL_SERVER_2008_DEFAULT_TIMESTAMP_PRECISION = 27;
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
		reserveNull(1);
		indvec[0] = SQL_NULL_DATA;
	}

	void BoundDatum::bindNullArray(const Local<Value> & p)
	{
		auto arr = Local<Array>::Cast(p);
		auto len = arr->Length();
		reserveNull(len);
		for (uint32_t i = 0; i < len; ++i)
		{
			indvec[i] = SQL_NULL_DATA;
		}
	}

	void BoundDatum::reserveNull(SQLLEN len)
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

	void BoundDatum::bindWLongVarChar(const Local<Value> & p)
	{
		bindWVarChar(p);
		sql_type = SQL_WLONGVARCHAR;
		param_size = buffer_len;
	}

	void BoundDatum::bindWVarChar(const Local<Value> & p)
	{
		auto str_param = p->ToString();
		bindWVarChar(p, str_param->Length());
	}

	void BoundDatum::bindChar(const Local<Value> & p)
	{
		bindVarChar(p);
	}

	void BoundDatum::bindVarChar(const Local<Value> & p)
	{
		auto str_param = p->ToString();
		SQLULEN precision = str_param->Length();
		if (param_size > 0) precision = std::min(param_size, precision);
		bindVarChar(p, static_cast<int>(precision));
	}

	void BoundDatum::reserveVarChar(size_t precision)
	{
		js_type = JS_STRING;
		c_type = SQL_C_CHAR;
		sql_type = SQL_VARCHAR;
		digits = 0;
		indvec[0] = SQL_NULL_DATA;
		storage->ReserveChars(std::max(1, static_cast<int>(precision)));
		auto * itr_p = storage->charvec_ptr->data();
		buffer = itr_p;
		buffer_len = precision;
		param_size = std::max(buffer_len, static_cast<SQLLEN>(1));
	}

	void BoundDatum::bindVarChar(const Local<Value> & p, int precision)
	{
		reserveVarChar(precision);
		if (!p->IsNull()) {
			auto str_param = p->ToString();
			str_param->WriteUtf8(storage->charvec_ptr->data(), precision);
			indvec[0] = precision;
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

	void BoundDatum::reserveWVarCharArray(size_t maxStrLen, size_t  arrayLen)
	{
		js_type = JS_STRING;
		c_type = SQL_C_WCHAR;
		sql_type = SQL_WVARCHAR;

		auto size = sizeof(uint16_t);
		indvec.resize(arrayLen);
		storage->ReserveUint16(arrayLen * maxStrLen);
		buffer = storage->uint16vec_ptr->data();
		buffer_len = maxStrLen * size;
		param_size = maxStrLen;
	}

	void BoundDatum::bindWVarCharArray(const Local<Value> & p)
	{
		int maxStrLen = getMaxStrLen(p);
		auto arr = Local<Array>::Cast(p);
		auto arrayLen = arr->Length();
		auto size = sizeof(uint16_t);
		reserveWVarCharArray(maxStrLen, arrayLen);

		auto itr = storage->uint16vec_ptr->begin();
		for (uint32_t i = 0; i < arrayLen; ++i)
		{
			indvec[i] = SQL_NULL_DATA;
			auto elem = arr->Get(i);
			if (!elem->IsNull()) {
				auto str = arr->Get(i)->ToString();
				auto width = str->Length() * size;
				indvec[i] = width;
				str->Write(&*itr, 0, maxStrLen);
			}
			itr += maxStrLen;
		}
	}

	void BoundDatum::bindWVarChar(const Local<Value> & p, int precision)
	{
		size_t maxStrLen = std::max(1, precision);
		auto size = sizeof(uint16_t);
		reserveWVarCharArray(maxStrLen, 1);

		indvec[0] = SQL_NULL_DATA;
		if (!p->IsNull()) {
			auto str_param = p->ToString();
			auto first_p = storage->uint16vec_ptr->data();
			str_param->Write(first_p, 0, precision);
			buffer_len = precision * size;
			if (precision > 4000)
			{
				param_size = 0;
			}else
			{
				param_size = std::max(buffer_len, static_cast<SQLLEN>(1));
			}
			
			indvec[0] = buffer_len;
		}
	}

	size_t getMaxObjectLen(const Local<Value> & p)
	{
		size_t objLen = 0;
		auto arr = Local<Array>::Cast(p);
		auto len = arr->Length();
		for (uint32_t i = 0; i < len; ++i)
		{
			auto o = arr->Get(i)->ToObject();
			auto width = node::Buffer::Length(o);
			if (width > objLen) objLen = width;
		}
		return objLen;
	}

	void BoundDatum::bindLongVarBinary(Local<Value> & p)
	{
		bindVarBinary(p);
		sql_type = SQL_LONGVARBINARY;
	}

	void BoundDatum::reserveVarBinaryArray(size_t maxObjLen, size_t  arrayLen)
	{
		js_type = JS_BUFFER;
		c_type = SQL_C_BINARY;
		sql_type = SQL_VARBINARY;
		digits = 0;
		auto size = sizeof(uint8_t);
		storage->ReserveChars(arrayLen * maxObjLen);
		indvec.resize(arrayLen);
		buffer = storage->charvec_ptr->data();
		buffer_len = maxObjLen * size;
		param_size = maxObjLen;
	}

	void BoundDatum::bindVarBinary(Local<Value> & p)
	{
		auto o = p.As<Object>();
		indvec[0] = SQL_NULL_DATA;
		auto objLen = !o->IsNull() ? node::Buffer::Length(o) : 0;
		reserveVarBinaryArray(objLen, 1);

		if (!o->IsNull()) {
			auto itr = storage->charvec_ptr->begin();
			auto ptr = node::Buffer::Data(o);
			indvec[0] = objLen;
			memcpy(&*itr, ptr, objLen);
		}
	}

	void BoundDatum::bindVarBinaryArray(const Local<Value> & p)
	{
		auto arr = Local<Array>::Cast(p);
		auto arrayLen = arr->Length();
		size_t maxObjLen = getMaxObjectLen(p);
		reserveVarBinaryArray(maxObjLen, arrayLen);
		auto itr = storage->charvec_ptr->data();
		for (uint32_t i = 0; i < arrayLen; ++i)
		{
			indvec[i] = SQL_NULL_DATA;
			auto elem = arr->Get(i);
			if (!elem->IsNull()) {
				auto o = elem->ToObject();
				auto ptr = node::Buffer::Data(o);
				auto objLen = node::Buffer::Length(o);
				indvec[i] = objLen;
				memcpy(&*itr, ptr, objLen);
			}
			itr += maxObjLen;
		}
	}

	void BoundDatum::bindBoolean(const Local<Value> & p)
	{
		reserveBoolean(1);
		auto & vec = *storage->charvec_ptr;
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
		reserveBoolean(len);
		auto & vec = *storage->charvec_ptr;
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

	void BoundDatum::reserveBoolean(SQLLEN len)
	{
		auto size = sizeof(char);
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

	void BoundDatum::bindNumeric(const Local<Value> & p)
	{
		reserveNumeric(1);
		sql_type = SQL_NUMERIC;
		indvec[0] = SQL_NULL_DATA;
		if (!p->IsNull()) {
			double d = p->NumberValue();
			auto &vec = *storage->numeric_ptr;
			auto & ns = vec[0];
			encodeNumericStruct(d, static_cast<int>(param_size), digits, ns);
			param_size = ns.precision;
			digits = ns.scale;
			indvec[0] = sizeof(SQL_NUMERIC_STRUCT);
		}
	}

	void BoundDatum::reserveNumeric(SQLLEN len)
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

	void BoundDatum::bindTinyInt(const Local<Value> & p)
	{
		bindInt32(p);
		sql_type = SQL_TINYINT;
	}

	void BoundDatum::bindSmallInt(const Local<Value> & p)
	{
		bindInt32(p);
		sql_type = SQL_SMALLINT;
	}

	void BoundDatum::bindInt32(const Local<Value> & p)
	{
		reserveInt32(1);
		indvec[0] = SQL_NULL_DATA;
		auto & vec = *storage->int32vec_ptr;
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
		reserveInt32(len);
		auto & vec = *storage->int32vec_ptr;
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

	void BoundDatum::reserveInt32(SQLLEN len)
	{
		auto size = sizeof(int32_t);
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

	void BoundDatum::bindUint32(const Local<Value> & p)
	{
		reserveUint32(1);
		auto & vec = *storage->uint32vec_ptr;
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
		reserveUint32(len);
		auto & vec = *storage->uint32vec_ptr;
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

	void BoundDatum::reserveUint32(SQLLEN len)
	{
		auto size = sizeof(uint32_t);
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

	void BoundDatum::bindDate(const Local<Value> & p)
	{
		reserveDate(1);
		// Since JS dates have no timezone context, all dates are assumed to be UTC
		indvec[0] = SQL_NULL_DATA;
		if (!p->IsNull()) {
			auto dateObject = Handle<Date>::Cast<Value>(p);
			assert(!dateObject.IsEmpty());
			// dates in JS are stored internally as ms count from Jan 1, 1970
			double d = dateObject->NumberValue();
			TimestampColumn sql_date(d);			
			auto & dt = (*storage->datevec_ptr)[0];
			sql_date.ToDateStruct(dt);
			indvec[0] = buffer_len;
		}
	}

	void BoundDatum::reserveDate(SQLLEN len)
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
			param_size = SQL_SERVER_2008_DEFAULT_DATETIME_PRECISION;
		digits = SQL_SERVER_2008_DEFAULT_DATETIME_SCALE;
	}

	void BoundDatum::bindTime(const Local<Value> & p)
	{
		reserveTime(1);
		// Since JS dates have no timezone context, all dates are assumed to be UTC
		indvec[0] = SQL_NULL_DATA;
		if (!p->IsNull()) {
			auto dateObject = Handle<Date>::Cast<Value>(p);
			assert(!dateObject.IsEmpty());
			// dates in JS are stored internally as ms count from Jan 1, 1970
			double d = dateObject->NumberValue();
			TimestampColumn sql_date(d);			
			auto & time2 = (*storage->time2vec_ptr)[0];
			sql_date.ToTime2Struct(time2);
			indvec[0] = buffer_len;
		}
	}

	void BoundDatum::reserveTime(SQLLEN len)
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

		param_size = SQL_SERVER_2008_DEFAULT_TIME_PRECISION;
		if (digits <=0) digits = SQL_SERVER_2008_DEFAULT_DATETIME_SCALE;
	}

	void BoundDatum::bindTimeStamp(const Local<Value> & p)
	{
		reserveTimeStamp(1);
		// Since JS dates have no timezone context, all dates are assumed to be UTC
		indvec[0] = SQL_NULL_DATA;
		if (!p->IsNull()) {
			auto dateObject = Handle<Date>::Cast<Value>(p);
			assert(!dateObject.IsEmpty());
			// dates in JS are stored internally as ms count from Jan 1, 1970
			double d = dateObject->NumberValue();
			TimestampColumn sql_date(d);
			auto & timestamp = (*storage->timestampvec_ptr)[0];
			sql_date.ToTimestampStruct(timestamp);
			indvec[0] = buffer_len;
		}
	}

	void BoundDatum::reserveTimeStamp(SQLLEN len)
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
		param_size = SQL_SERVER_2008_DEFAULT_TIMESTAMP_PRECISION;
		if (digits <= 0) digits = SQL_SERVER_2008_DEFAULT_DATETIME_SCALE;	
	}

	void BoundDatum::bindTimeStampOffset(const Local<Value> & p)
	{
		reserveTimeStampOffset(1);
		// Since JS dates have no timezone context, all dates are assumed to be UTC
		indvec[0] = SQL_NULL_DATA;
		if (!p->IsNull()) {
			auto dateObject = Handle<Date>::Cast<Value>(p);
			assert(!dateObject.IsEmpty());
			// dates in JS are stored internally as ms count from Jan 1, 1970
			double d = dateObject->NumberValue();
			auto & ts = (*storage->timestampoffsetvec_ptr)[0];
			TimestampColumn sql_date(d, 0, offset);
			sql_date.ToTimestampOffset(ts);
			indvec[0] = buffer_len;
		}
	}

	void BoundDatum::reserveTimeStampOffset(SQLLEN len)
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
		param_size = SQL_SERVER_2008_DEFAULT_DATETIME_PRECISION;
		if (digits <= 0) digits = SQL_SERVER_2008_DEFAULT_DATETIME_SCALE;
	}

	void BoundDatum::bindTimeStampOffsetArray(const Local<Value>& p)
	{
		auto arr = Local<Array>::Cast(p);
		auto len = arr->Length();
		reserveTimeStampOffset(len);
		auto & vec = *storage->timestampoffsetvec_ptr;
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
		reserveInteger(1);
		auto & vec = *storage->int64vec_ptr;
		indvec[0] = SQL_NULL_DATA;
		if (!p->IsNull()) {
			vec[0] = p->IntegerValue();
			indvec[0] = 0;
		}
	}

	void BoundDatum::reserveInteger(SQLLEN len)
	{
		auto size = sizeof(int64_t);
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

	void BoundDatum::bindIntegerArray(const Local<Value>& p)
	{
		auto arr = Local<Array>::Cast(p);
		auto len = arr->Length();
		reserveUint32(len);
		auto & vec = *storage->int64vec_ptr;
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

	void BoundDatum::bindFloat(const Local<Value> & p)
	{
		bindDouble(p);
		sql_type = SQL_FLOAT;
	}

	void BoundDatum::bindReal(const Local<Value> & p)
	{
		bindDouble(p);
		sql_type = SQL_REAL;
	}

	void BoundDatum::bindDouble(const Local<Value> & p)
	{
		reserveDouble(1);
		auto & vec = *storage->doublevec_ptr;
		indvec[0] = SQL_NULL_DATA;
		if (!p->IsNull()) {
			vec[0] = p->NumberValue();
			indvec[0] = 0;
		}
	}

	void BoundDatum::reserveDouble(SQLLEN len)
	{
		auto size = sizeof(double);
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

	void BoundDatum::bindDoubleArray(const Local<Value>& p)
	{
		auto arr = Local<Array>::Cast(p);
		auto len = arr->Length();
		reserveDouble(len);
		auto & vec = *storage->doublevec_ptr;
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

	bool BoundDatum::bindDatumType(Local<Value> & p)
	{
		if (p->IsNull()) {
			bindNull(p);
		}
		else if (p->IsString()) {		
			bindWVarChar(p);
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
			bindTimeStampOffset(p);
		}
		else if (p->IsObject() && node::Buffer::HasInstance(p)) {
			bindVarBinary(p);
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

	bool isNumeric(std::wstring & v)
	{
		auto res = v == L"numeric"
			|| v == L"decimal"
			|| v == L"smallmoney"
			|| v == L"money"
			|| v == L"float"
			|| v == L"real";
		return res;
	}

	bool isInt(const std::wstring & v)
	{
		auto res = v == L"smallint"
			|| v == L"int"
			|| v == L"bigint"
			|| v == L"tinyint";
		return res;
	}

	bool isString(const std::wstring & v)
	{
		auto res = v == L"char"
			|| v == L"text"
			|| v == L"varchar";
		return res;
	}

	bool isBinary(const std::wstring & v)
	{
		auto res = v == L"binary";
		return res;
	}

	bool isBit(const std::wstring & v)
	{
		auto res = v == L"bit";
		return res;
	}

	bool isDate(const std::wstring & v)
	{
		auto res = v == L"date"
			|| v == L"datetimeoffset"
			|| v == L"datetime2"
			|| v == L"smalldatetime"
			|| v == L"datetime"
			|| v == L"time";
		return res;
	}

	bool SqlTypeSMapsToNumeric(Local<Value> p)
	{
		auto str = getH(p, "type_id");
		auto v = FromV8String(str);
		auto res = isNumeric(v);
		return res;
	}

	bool SqlTypeSMapsToUInt32(Local<Value> p)
	{
		auto str = getH(p, "type_id");
		auto v = FromV8String(str);
		auto res = v == L"sbigint";
		return res;
	}

	bool SqlTypeSMapsToInt32(Local<Value> p)
	{
		auto str = getH(p, "type_id");
		auto v = FromV8String(str);
		auto res = isInt(v);
		return res;
	}

	bool SqlTypeSMapsTotring(Local<Value> p)
	{
		auto str = getH(p, "type_id");
		auto v = FromV8String(str);
		auto res = isString(v);
		return res;
	}

	bool SqlTypeSMapsToBoolean(Local<Value> p)
	{
		auto str = getH(p, "type_id");
		auto v = FromV8String(str);
		auto res = isBit(v);
		return res;
	}

	bool SqlTypeSMapsToDate(Local<Value> p)
	{
		auto str = getH(p, "type_id");
		auto v = FromV8String(str);
		auto res = isDate(v);
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
		auto isOutput = v->ToInteger();

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

	void BoundDatum::assignPrecision(Local<Object> &pv)
	{
		auto precision = get(pv, "precision");
		if (!precision->IsUndefined()) {
			param_size = precision->Int32Value();
		}

		auto scale = get(pv, "scale");
		if (!scale->IsUndefined()) {
			digits = scale->Int32Value();
		}

		auto off = get(pv, "offset");
		if (!off->IsUndefined()) {
			offset = off->Int32Value();
		}
	}

	bool BoundDatum::userBind(Local<Value> &p, Local<Value> &v)
	{
		sql_type = v->Int32Value();
		param_type = SQL_PARAM_INPUT;

		auto pv = p->ToObject();
		auto pp = get(pv, "value");

		assignPrecision(pv);

		switch (sql_type)
		{

		case SQL_LONGVARBINARY:
			bindLongVarBinary(pp);
			break;

		case SQL_VARBINARY:
		{
			if (pp->IsNull() 
				|| (pp->IsObject() && node::Buffer::HasInstance(pp))) {
				bindVarBinary(pp);
			}
			else {
				err = "Invalid parameter type";
				return false;
			}
		}
		break;

		case SQL_INTEGER:
			bindInt32(pp);
			break;

		case SQL_WVARCHAR:
			bindWVarChar(pp);
			break;

		case SQL_WLONGVARCHAR:
			bindWLongVarChar(pp);
			break;

		case SQL_BIT:
			bindBoolean(pp);
			break;

		case SQL_BIGINT:
			bindInteger(pp);
			break;

		case SQL_DOUBLE:
			bindDouble(pp);
			break;

		case SQL_FLOAT:
			bindFloat(pp);
			break;

		case SQL_REAL:
			bindReal(pp);
			break;

		case SQL_TINYINT:
			bindTinyInt(pp);
			break;

		case SQL_SMALLINT:
			bindSmallInt(pp);
			break;

		case SQL_NUMERIC:
			bindNumeric(pp);
		break;

		case SQL_CHAR:
			bindChar(pp);
			break;

		case SQL_VARCHAR:
			bindVarChar(pp);
			break;

		case SQL_SS_TIME2:
			bindTime(pp);
			break;

		case SQL_TYPE_DATE:
			bindDate(pp);
			break;

		case SQL_TYPE_TIMESTAMP:
			bindTimeStamp(pp);
			break;

		case SQL_SS_TIMESTAMPOFFSET:
			bindTimeStampOffset(pp);
			break;

		default:
			return false;
		}

		return true;
	}

	bool BoundDatum::bindObject(Local<Value> &p)
	{
		auto po = p->ToObject();

		auto v = get(po, "is_output");
		if (!v->IsUndefined()) {
			return procBind(p, v);
		}

		v = get(po, "sql_type");
		if (!v->IsUndefined()) {
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
			bindWVarCharArray(pp);
		}
		else if (counts.dateCount != 0)
		{
			bindTimeStampOffsetArray(pp);
		}
		else if (counts.bufferCount != 0)
		{
			bindVarBinaryArray(pp);
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
		auto s = fact.fromTwoByte(storage->uint16vec_ptr->data());
		return s;
	}

	Handle<Value> BoundDatum::unbindDouble() const
	{
		nodeTypeFactory fact;
		auto & vec = *storage->doublevec_ptr;
		auto s = fact.newNumber(vec[0]);
		return s;
	}

	Handle<Value> BoundDatum::unbindBoolean() const
	{
		nodeTypeFactory fact;
		auto & vec = *storage->uint16vec_ptr;
		auto s = fact.newBoolean(vec[0]);
		return s;
	}

	Handle<Value> BoundDatum::unbindInt32() const
	{
		nodeTypeFactory fact;
		auto & vec = *storage->int32vec_ptr;
		auto s = fact.newInt32(vec[0]);
		return s;
	}

	Handle<Value> BoundDatum::unbindUint32() const
	{
		nodeTypeFactory fact;
		auto & vec = *storage->uint32vec_ptr;
		auto s = fact.newUint32(vec[0]);
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
			auto & vec = *storage->int64vec_ptr;
			v = fact.newInt64(vec[0]);
		}
		return v;
	}

	Handle<Value> BoundDatum::unbindDate() const
	{
		auto & vec = *storage->timestampoffsetvec_ptr;
		TimestampColumn tsc(vec[0]);
		return tsc.ToValue();
	}

	void BoundDatum::reserveColumnType(SQLSMALLINT  type, size_t len)
	{
		switch (type)
		{
		case SQL_SS_VARIANT:
			reserveVarChar(len);
			break;

		case SQL_CHAR:
		case SQL_VARCHAR:
		case SQL_LONGVARCHAR:
		case SQL_WCHAR:
		case SQL_WVARCHAR:
		case SQL_WLONGVARCHAR:
		case SQL_SS_XML:
		case SQL_GUID:
			reserveWVarCharArray(len + 1, 1);
			break;

		case SQL_BIT:
			reserveBoolean(1);
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
			reserveInteger(1);
			break;

		case SQL_DECIMAL:
		case SQL_NUMERIC:
		case SQL_REAL:
		case SQL_FLOAT:
		case SQL_DOUBLE:
		case SQL_BIGINT:
			reserveDouble(1);
			break;

		case SQL_BINARY:
		case SQL_VARBINARY:
		case SQL_LONGVARBINARY:
		case SQL_SS_UDT:
			reserveVarBinaryArray(len, 1);
			break;

		case SQL_SS_TIMESTAMPOFFSET:
			reserveTimeStampOffset(1);
			break;

		case SQL_TYPE_TIME:
		case SQL_SS_TIME2:
			reserveTime(1);
			break;

		case SQL_TIMESTAMP:
		case SQL_DATETIME:
		case SQL_TYPE_TIMESTAMP:
		case SQL_TYPE_DATE:
			reserveTimeStamp(1);
			break;

		default:
			reserveVarChar(len);
			break;
		}
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