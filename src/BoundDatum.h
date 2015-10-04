#pragma once

namespace mssql
{
	using namespace std;

	class BoundDatum {
	public:

		bool bind(Local<Value> &p);
		Local<Value> BoundDatum::unbind();

		char *getErr() { return err;  }

		BoundDatum(void) :
			js_type(JS_UNKNOWN),
			c_type(0),
			sql_type(0),
			param_size(0),
			digits(0),
			buffer(nullptr),
			buffer_len(0),
			indptr(SQL_NULL_DATA),
			param_type(SQL_PARAM_INPUT),
			err(nullptr)
		{
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
			indptr = other.indptr;

			vec_ptr = other.vec_ptr;
			double_ptr = other.double_ptr;
			int64_t_ptr = other.int64_t_ptr;
			time_ptr = other.time_ptr;
			uint32_ptr = other.uint32_ptr;
			uint16_ptr = other.uint16_ptr;
			int32_ptr = other.int32_ptr;

			param_type = other.param_type;
			err = other.err;

			other.buffer = nullptr;
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
		SQLLEN indptr;
		uint16_t param_type;

	private:

		shared_ptr<vector<uint16_t>> vec_ptr;
		shared_ptr<int32_t> int32_ptr;
		shared_ptr<uint16_t> uint16_ptr;
		shared_ptr<uint32_t> uint32_ptr;
		shared_ptr<double> double_ptr;
		shared_ptr<int64_t> int64_t_ptr;
		shared_ptr<SQL_SS_TIMESTAMPOFFSET_STRUCT> time_ptr;

		char * err;

		void bindNull(const Local<Value> & p);
		void bindString(const Local<Value> & p);
		void bindString(const Local<Value>& p, int str_len);
		void bindBoolean(const Local<Value> & p);
		void bindInt32(const Local<Value> & p);
		void bindUint32(const Local<Value> & p);
		void bindNumber(const Local<Value> & p);
		void bindDate(const Local<Value> & p);
		void bindInteger(const Local<Value>& p);
		void bindDouble(const Local<Value>& p);
		void bindDefault(Local<Value> & p);
		bool bindDatumType(Local<Value>& p);
		bool bind(Local<Object> o, const char* if_str, uint16_t type);
		bool bindObject(Local<Value> &p);
		
		Handle<Value> BoundDatum::unbindNull();
		Handle<Value> BoundDatum::unbindString();
		Handle<Value> BoundDatum::unbindDouble();
		Handle<Value> BoundDatum::unbindBoolean();
		Handle<Value> BoundDatum::unbindInt32();
		Handle<Value> BoundDatum::unbindUint32();
		Handle<Value> BoundDatum::unbindNumber();
		Handle<Value> BoundDatum::unbindDate();
	};
}
