#pragma once

namespace mssql
{
	using namespace std;

	class BoundDatum {
	public:

		bool bind(Local<Value> &p);
		Local<Value> BoundDatum::unbind();
		SQLLEN * getInd() { return indvec.data(); }
		char *getErr() { return err;  }
		int size() { return indvec.size(); }

		BoundDatum(void) :
			js_type(JS_UNKNOWN),
			c_type(0),
			sql_type(0),
			param_size(0),
			digits(0),
			buffer(nullptr),
			buffer_len(0),
			param_type(SQL_PARAM_INPUT),
			uint16vec_ptr(nullptr),
			err(nullptr)
		{
			indvec = vector<SQLLEN>(1);
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

			doublevec_ptr = other.doublevec_ptr;
			uint16vec_ptr = other.uint16vec_ptr;
			int32vec_ptr = other.int32vec_ptr;
			uint32vec_ptr = other.uint32vec_ptr;
			int64vec_ptr = other.int64vec_ptr;
			timevec_ptr = other.timevec_ptr;

			indvec = other.indvec;

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
		uint16_t param_type;

	private:
	
		vector<SQLLEN> indvec;

		shared_ptr<vector<uint16_t>> uint16vec_ptr;
		shared_ptr<vector<int32_t>> int32vec_ptr;
		shared_ptr<vector<uint32_t>> uint32vec_ptr;
		shared_ptr<vector<int64_t>> int64vec_ptr;
		shared_ptr<vector<double>> doublevec_ptr;
		shared_ptr<vector<SQL_SS_TIMESTAMPOFFSET_STRUCT>> timevec_ptr;

		char * err;

		void bindNull(const Local<Value> & p);
		void bindString(const Local<Value> & p);
		void bindString(const Local<Value>& p, int str_len);
		void bindStringArray(const Local<Value> & p);

		void bindBoolean(const Local<Value> & p);
		void bindBoolean(SQLLEN len);
		void bindBooleanArray(const Local<Value> & p);

		void bindInt32(const Local<Value> & p);
		void bindInt32(SQLLEN len);
		void bindInt32Array(const Local<Value> & p);

		void bindUint32(const Local<Value> & p);
		void bindUint32(SQLLEN len);
		void bindUint32Array(const Local<Value> & p);

		void bindInteger(const Local<Value>& p);
		void bindInteger(SQLLEN len);
		void bindIntegerArray(const Local<Value> & p);

		void bindDouble(const Local<Value>& p);
		void bindDouble(SQLLEN len);
		void bindDoubleArray(const Local<Value> & p);

		void bindDate(const Local<Value> & p);
		void bindDate(SQLLEN len);
		void bindDateArray(const Local<Value> & p);

		void bindNumber(const Local<Value> & p);
		void bindNumberArray(const Local<Value> & p);
			
		void bindDefault(Local<Value> & p);
		bool bindDatumType(Local<Value>& p);
		bool bind(Local<Object> o, const char* if_str, uint16_t type);
		bool bindObject(Local<Value> &p);
		bool bindArray(Local<Value> &p);
		
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
