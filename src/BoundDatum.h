#pragma once
// undo these tokens to use numeric_limits below

#include <BoundDatumHelper.h>

namespace mssql
{
	using namespace std;

	class BoundDatum {
	public:
		bool bind(Local<Value> &p);
		void reserve_column_type(SQLSMALLINT type, size_t len);

		bool get_defined_precision() const {
			return definedPrecision;
		}

		bool get_defined_scale() const {
			return definedScale;
		}

		Local<Value> unbind() const;
		
		vector<SQLLEN> & get_ind_vec() { return indvec; }
		
		char *getErr() const { return err; }

		shared_ptr<DatumStorage> get_storage() { return storage; }

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

		void bind_null(const Local<Value> & p);
		void bind_null_array(const Local<Value> & p);
		void reserve_null(SQLLEN len);

		void bind_long_var_binary(Local<Value> & p);

		void bind_w_long_var_char(const Local<Value> & p);
		void bind_w_var_char(const Local<Value> & p);
		void bind_w_var_char(const Local<Value>& p, int str_len);
		void reserve_w_var_char_array(size_t maxStrLen, size_t  arrayLen);
		void bind_w_var_char_array(const Local<Value> & p);

		void bind_boolean(const Local<Value> & p);
		void reserve_boolean(SQLLEN len);
		void bind_boolean_array(const Local<Value> & p);

		void bind_small_int(const Local<Value> & p);
		void bind_tiny_int(const Local<Value> & p);
		void bind_numeric(const Local<Value> & p);
		void reserve_numeric(SQLLEN len);

		void bind_int32(const Local<Value> & p);
		void reserve_int32(SQLLEN len);
		void bind_int32_array(const Local<Value> & p);

		void bind_uint32(const Local<Value> & p);
		void reserve_uint32(SQLLEN len);
		void bind_uint32_array(const Local<Value> & p);

		void bind_integer(const Local<Value>& p);
		void reserve_integer(SQLLEN len);
		void bind_integer_array(const Local<Value> & p);

		void bind_float(const Local<Value> & p);
		void bind_real(const Local<Value> & p);

		void bind_double(const Local<Value>& p);
		void reserve_double(SQLLEN len);
		void bind_double_array(const Local<Value> & p);

		void bind_time(const Local<Value> & p);
		void reserve_time(SQLLEN len);

		void bind_date(const Local<Value> & p);
		void reserve_date(SQLLEN len);

		void bind_time_stamp(const Local<Value> & p);
		void reserve_time_stamp(SQLLEN len);

		void bind_time_stamp_offset(const Local<Value> & p);
		void reserve_time_stamp_offset(SQLLEN len);
		void bind_time_stamp_offset_array(const Local<Value> & p);

		void bind_number(const Local<Value> & p);
		void bind_number_array(const Local<Value> & p);

		void bind_var_binary( Local<Value> & p);
		void bind_var_binary_array(const Local<Value> & p);
		void reserve_var_binary_array(size_t maxObjLen, size_t  arrayLen);

		bool bind_datum_type(Local<Value>& p);
		bool bind(Local<Object> o, const char* if_str, uint16_t type);
		bool bind_object(Local<Value> &p);
		bool bind_array(Local<Value> &p);

		bool proc_bind(Local<Value> &p, Local<Value> &v);
		void bind_char(const Local<Value> & pp);
		void bind_var_char(const Local<Value> & pp);
		void bind_var_char(const Local<Value> & p, int precision);
		void reserve_var_char(size_t precision);
		bool user_bind(Local<Value> &p, Local<Value> &v);
		void assign_precision(Local<Object> &pv);

		static Handle<Value> unbind_null();
		Handle<Value> unbind_string() const;
		Handle<Value> unbind_double() const;
		Handle<Value> unbind_boolean() const;
		Handle<Value> unbind_int32() const;
		Handle<Value> unbind_uint32() const;
		Handle<Value> unbind_number() const;
		Handle<Value> unbind_date() const;
	};
}
