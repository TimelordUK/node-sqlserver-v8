#pragma once
// undo these tokens to use numeric_limits below

#include "BoundDatumHelper.h"

namespace mssql
{
	using namespace std;

	class BoundDatum {
	public:
		bool bind(Local<Value> &p);
		void reserveColumnType(SQLSMALLINT type, size_t len);

		bool getDefinedPrecision() const {
			return definedPrecision;
		}

		bool getDefinedScale() const {
			return definedScale;
		}

		Local<Value> unbind() const;
		
		vector<SQLLEN> & getIndVec() { return indvec; }
		
		char *getErr() const { return err; }

		shared_ptr<DatumStorage> getStorage() { return storage; }

		BoundDatum(void) :
			js_type(JS_UNKNOWN),
			c_type(0),
			sql_type(0),
			param_size(0),
			digits(0),
			buffer(nullptr),
			buffer_len(0),
			param_type(SQL_PARAM_INPUT),
			offset(0),
			definedPrecision(false),
			definedScale(false),
			err(nullptr)
		{
			indvec = vector<SQLLEN>(1);
			storage = make_shared<DatumStorage>();
		}

		BoundDatum(BoundDatum&& other)
		{
			js_type = other.js_type;
			c_type = other.c_type;
			sql_type = other.sql_type;
			param_size = other.param_size;
			digits = other.digits;
			buffer = other.buffer;
			buffer_len = other.buffer_len;
			offset = other.offset;

			storage = other.storage;

			indvec = other.indvec;
			param_type = other.param_type;
			err = other.err;
			other.buffer_len = 0;
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
		SQLSMALLINT digits;
		SQLPOINTER buffer;
		SQLLEN buffer_len;
		uint16_t param_type;
		uint32_t offset;

	private:
		vector<SQLLEN> indvec;
		shared_ptr<DatumStorage> storage;
		bool definedPrecision;
		bool definedScale;

		char * err;

		void bindNull(const Local<Value> & p);
		void bindNullArray(const Local<Value> & p);
		void reserveNull(SQLLEN len);

		void bindLongVarBinary(Local<Value> & p);
		void bindVarBinary(Local<Value> & p);

		void bindWLongVarChar(const Local<Value> & p);
		void bindWVarChar(const Local<Value> & p);
		void bindWVarChar(const Local<Value>& p, int str_len);
		void reserveWVarCharArray(size_t maxStrLen, size_t  arrayLen);
		void bindWVarCharArray(const Local<Value> & p);

		void bindBoolean(const Local<Value> & p);
		void reserveBoolean(SQLLEN len);
		void bindBooleanArray(const Local<Value> & p);

		void bindSmallInt(const Local<Value> & p);
		void bindTinyInt(const Local<Value> & p);
		void bindNumeric(const Local<Value> & p);
		void reserveNumeric(SQLLEN len);

		void bindInt32(const Local<Value> & p);
		void reserveInt32(SQLLEN len);
		void bindInt32Array(const Local<Value> & p);

		void bindUint32(const Local<Value> & p);
		void reserveUint32(SQLLEN len);
		void bindUint32Array(const Local<Value> & p);

		void bindInteger(const Local<Value>& p);
		void reserveInteger(SQLLEN len);
		void bindIntegerArray(const Local<Value> & p);

		void bindFloat(const Local<Value> & p);
		void bindReal(const Local<Value> & p);

		void bindDouble(const Local<Value>& p);
		void reserveDouble(SQLLEN len);
		void bindDoubleArray(const Local<Value> & p);

		void bindTime(const Local<Value> & p);
		void reserveTime(SQLLEN len);

		void bindDate(const Local<Value> & p);
		void reserveDate(SQLLEN len);

		void bindTimeStamp(const Local<Value> & p);
		void reserveTimeStamp(SQLLEN len);

		void bindTimeStampOffset(const Local<Value> & p);
		void reserveTimeStampOffset(SQLLEN len);
		void bindTimeStampOffsetArray(const Local<Value> & p);

		void bindNumber(const Local<Value> & p);
		void bindNumberArray(const Local<Value> & p);

		void bindVarBinary(const Local<Value> & p);
		void bindVarBinaryArray(const Local<Value> & p);
		void reserveVarBinaryArray(size_t maxObjLen, size_t  arrayLen);

		bool bindDatumType(Local<Value>& p);
		bool bind(Local<Object> o, const char* if_str, uint16_t type);
		bool bindObject(Local<Value> &p);
		bool bindArray(Local<Value> &p);

		bool procBind(Local<Value> &p, Local<Value> &v);
		void bindChar(const Local<Value> & pp);
		void bindVarChar(const Local<Value> & pp);
		void bindVarChar(const Local<Value> & p, int precision);
		void reserveVarChar(size_t precision);
		bool userBind(Local<Value> &p, Local<Value> &v);
		void assignPrecision(Local<Object> &pv);


		static Handle<Value> unbindNull();
		Handle<Value> unbindString() const;
		Handle<Value> unbindDouble() const;
		Handle<Value> unbindBoolean() const;
		Handle<Value> unbindInt32() const;
		Handle<Value> unbindUint32() const;
		Handle<Value> unbindNumber() const;
		Handle<Value> unbindDate() const;
	};
}
