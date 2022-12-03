#pragma once
// undo these tokens to use numeric_limits below

#include "stdafx.h"
#include <BoundDatumHelper.h>

namespace mssql
{
	using namespace std;
	class QueryOperationParams;

	class BoundDatum {
	public:
		bool bind(Local<Value> &p);
		void reserve_column_type(SQLSMALLINT type, size_t& len, const size_t row_count);

		bool get_defined_precision() const {
			return definedPrecision;
		}

		bool get_defined_scale() const {
			return definedScale;
		}

		Local<Value> unbind() const;
		
		vector<SQLLEN> & get_ind_vec()  { return _indvec; }
		
		char *getErr() const { return err; }

		shared_ptr<DatumStorage> get_storage() { return _storage; }

		BoundDatum() :
			js_type(JS_UNKNOWN),
			c_type(0),
			sql_type(0),
			param_size(0),
			max_length(0),
			digits(0),
			buffer(nullptr),
			buffer_len(0),
			param_type(SQL_PARAM_INPUT),
			offset(0),
			is_bcp(false),
			ordinal_position(0),
			bcp_terminator_len(0),
			bcp_terminator(NULL),
			is_tvp(false),
			is_money(false),
			tvp_no_cols(0),
			definedPrecision(false),
			definedScale(false),
			err(nullptr)
		{
			_indvec = vector<SQLLEN>(1);
			_storage = make_shared<DatumStorage>();
			_params = nullptr;
		}

		BoundDatum(shared_ptr<QueryOperationParams> params) : BoundDatum()
		{
			_params = params;
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
		SQLULEN max_length;
		SQLSMALLINT digits;
		SQLPOINTER buffer;
		SQLLEN buffer_len;
		uint16_t param_type;
		int32_t offset;
		bool is_bcp;
		int32_t bcp_version;
		uint32_t ordinal_position;
		SQLULEN bcp_terminator_len;
		LPCBYTE bcp_terminator;

		bool is_tvp;
		bool is_money;
		int tvp_no_cols;
		wstring name;


	private:
	
		vector<SQLLEN> _indvec;
		shared_ptr<DatumStorage> _storage;
		shared_ptr<QueryOperationParams> _params;
		bool definedPrecision;
		bool definedScale;

		char * err;
	
		void bind_null(const Local<Value> & p);
		void bind_null_array(const Local<Value> & p);
		void reserve_null(SQLLEN len);

		void bind_long_var_binary(Local<Value> & p);

		void bind_w_long_var_char(const Local<Value> & p);
		void bind_w_var_char(const Local<Value> & p);
		void bind_w_var_char(const Local<Value>& p, int precision);
		void reserve_w_var_char_array(size_t max_str_len, size_t  array_len);
		void bind_w_var_char_array(const Local<Value> & p);
		void bind_w_var_char_array_bcp(const Local<Value> & p);

		void bind_boolean(const Local<Value> & p);
		void reserve_boolean(SQLLEN len);
		void bind_boolean_array(const Local<Value> & p);

		void bind_small_int(const Local<Value> & p);
		void bind_tiny_int(const Local<Value> & p);

		void bind_numeric(const Local<Value> & p);
		void bind_numeric_struct(double d, SQL_NUMERIC_STRUCT & ns);
		void bind_numeric_array(const Local<Value> & p);
		void reserve_numeric(SQLLEN len);

		void bind_int8(const Local<Value> & p);
		void reserve_int8(SQLLEN len);
		void bind_int8_array(const Local<Value> & p);

		void bind_int16(const Local<Value> & p);
		void reserve_int16(SQLLEN len);
		void bind_int16_array(const Local<Value> & p);

		void bind_int32(const Local<Value> & p);
		void reserve_int32(SQLLEN len);
		void bind_int32_array(const Local<Value> & p);

		void bind_uint32(const Local<Value> & p);
		void reserve_uint32(SQLLEN len);
		void bind_uint32_array(const Local<Value> & p);

		void bind_integer(const Local<Value>& p);
		void reserve_integer(SQLLEN len);
		void bind_integer_array(const Local<Value> & p);

		void reserve_big_integer(SQLLEN len);
	
		void bind_float(const Local<Value> & p);
		void bind_real(const Local<Value> & p);

		void bind_decimal(const Local<Value>& p);
		void reserve_decimal(SQLLEN len);
		void bind_decimal_array(const Local<Value>& p);

		void bind_double(const Local<Value>& p);
		void reserve_double(SQLLEN len);
		void bind_double_array(const Local<Value> & p);

		void bind_time(const Local<Value> & p);
		void bind_time_array(const Local<Value> & p);
		void reserve_time(SQLLEN len);

		void bind_date(const Local<Value> & p);
		void bind_date_array(const Local<Value> & p);
		void reserve_date(SQLLEN len);

		void bind_time_stamp(const Local<Value> & p);
		void bind_time_stamp_array(const Local<Value> & p);
		void reserve_time_stamp(SQLLEN len);

		void bind_time_stamp_offset(const Local<Value> & p);
		void reserve_time_stamp_offset(SQLLEN len);
		void bind_time_stamp_offset_array(const Local<Value> & p);

		void bind_number(const Local<Value> & p);
		void bind_number_array(const Local<Value> & p);

		void bind_tvp(Local<Value> & p);

		void bind_binary( Local<Value> & p);
		void bind_binary_array(const Local<Value> & p);
		void bind_binary_array_bcp(const Local<Value> & p);
		void reserve_binary_array(size_t max_obj_len, size_t  array_len);

		void bind_var_binary( Local<Value> & p);
		void bind_var_binary_array(const Local<Value> & p);
		void bind_var_binary_array_bcp(const Local<Value> & p);
		void reserve_var_binary_array(size_t max_obj_len, size_t  array_len);

		bool bind_datum_type(Local<Value>& p);
		bool bind(Local<Object> o, const char* if_str, uint16_t type);
		bool bind_object(Local<Value> &p);
		bool bind_array(Local<Value> &pp);

		bool proc_bind(Local<Value> &p, Local<Value> &v);
		void bind_char(const Local<Value> & pp);
		void bind_var_char(const Local<Value> & p);
		void bind_var_char_array_bcp(const Local<Value>& p);
		void bind_var_char_array(const Local<Value>& p);
		void bind_var_char(const Local<Value> & p, int precision);
		void reserve_var_char_array(size_t precision, size_t  array_len);
		bool user_bind(Local<Value> &p, Local<Value> &v);
		void assign_precision(Local<Object> &pv);

		void sql_longvarbinary(Local<Value> pp);
		void sql_integer(Local<Value> pp);
		void sql_wvarchar(Local<Value> pp);
		void sql_wlongvarchar(Local<Value> pp);
		void sql_bit(Local<Value> pp);
		void sql_bigint(Local<Value> pp);
		void sql_double(Local<Value> pp);
		void sql_float(Local<Value> pp);
		void sql_real(Local<Value> pp);
		void sql_tinyint(Local<Value> pp);
		void sql_smallint(Local<Value> pp);
		void sql_decimal(const Local<Value> pp);
		void sql_numeric(Local<Value> pp);
		void sql_char(Local<Value> pp);
		void sql_varchar(Local<Value> pp);
		void sql_ss_time2(Local<Value> pp);
		void sql_type_date(Local<Value> pp);
		void sql_type_timestamp(Local<Value> pp);
		void sql_ss_timestampoffset(Local<Value> pp);
		void sql_varbinary(Local<Value> pp);
		void sql_binary(Local<Value> pp);
		size_t get_default_size(size_t len) const;

		static Local<Value> unbind_null();
		Local<Value> unbind_string() const;
		Local<Value> unbind_double() const;
		Local<Value> unbind_boolean() const;
		Local<Value> unbind_int32() const;
		Local<Value> unbind_uint32() const;
		Local<Value> unbind_number() const;
		Local<Value> unbind_date() const;
	};
}
