#pragma once
// undo these tokens to use numeric_limits below
#undef min
#undef max

#include<v8.h>
#include<sqlext.h>

namespace mssql
{
	using namespace std;

	class BoundDatum {
	public:
		bool bind(Local<Value> &p);
		bool getDefinedPrecision() const {
			return definedPrecision;
		}

		bool getDefinedScale() const {
			return definedScale;
		}
		Local<Value> unbind() const;
		vector<SQLLEN> & getIndVec() { return indvec; }
		char *getErr() const { return err; }

		class DatumStorage
		{		
		public:

			typedef vector<uint16_t> uint16_t_vec_t;
			typedef vector<char> char_vec_t;
			typedef vector<int32_t> int32_vec_t;
			typedef vector<uint32_t> uint32_vec_t;
			typedef vector<int64_t> int64_vec_t;
			typedef vector<double> double_vec_t;
			typedef vector<SQL_SS_TIMESTAMPOFFSET_STRUCT> timestamp_offset_vec_t;
			typedef vector<SQL_SS_TIME2_STRUCT> time2_struct_vec_t;
			typedef vector<SQL_TIMESTAMP_STRUCT> timestamp_struct_vec_t;
			typedef vector<SQL_DATE_STRUCT > date_struct_vec_t;
			typedef vector<SQL_NUMERIC_STRUCT> numeric_struct_vec_t;

			DatumStorage() :
				charvec_ptr(nullptr),
				uint16vec_ptr(nullptr),
				int32vec_ptr(nullptr),
				uint32vec_ptr(nullptr),
				int64vec_ptr(nullptr),
				doublevec_ptr(nullptr),
				timestampoffsetvec_ptr(nullptr),
				time2vec_ptr(nullptr),
				timestampvec_ptr(nullptr),
				datevec_ptr(nullptr),
				numeric_ptr(nullptr)
			{
			}
		
			void ReassignStorage(DatumStorage &other)
			{
				doublevec_ptr = other.doublevec_ptr;
				uint16vec_ptr = other.uint16vec_ptr;
				int32vec_ptr = other.int32vec_ptr;
				uint32vec_ptr = other.uint32vec_ptr;
				int64vec_ptr = other.int64vec_ptr;
				timestampoffsetvec_ptr = other.timestampoffsetvec_ptr;
				datevec_ptr = other.datevec_ptr;
				time2vec_ptr = other.time2vec_ptr;
				timestampvec_ptr = other.timestampvec_ptr;
				charvec_ptr = other.charvec_ptr;
				numeric_ptr = other.numeric_ptr;
			}

			void ReserveNumerics(size_t len)
			{
				numeric_ptr = make_shared<vector<SQL_NUMERIC_STRUCT>>(len);
			}

			void ReserveChars(size_t len)
			{
				charvec_ptr = make_shared<vector<char>>(len);
			}

			void ReserveUint16(size_t len)
			{
				uint16vec_ptr = make_shared<uint16_t_vec_t>(len);
			}

			shared_ptr<int32_vec_t> int32vec_ptr;
			shared_ptr<uint32_vec_t> uint32vec_ptr;
			shared_ptr<int64_vec_t> int64vec_ptr;
			shared_ptr<double_vec_t> doublevec_ptr;
			shared_ptr<timestamp_offset_vec_t> timestampoffsetvec_ptr;
			shared_ptr<time2_struct_vec_t> time2vec_ptr;
			shared_ptr<timestamp_struct_vec_t> timestampvec_ptr;
			shared_ptr<date_struct_vec_t> datevec_ptr;
			shared_ptr<numeric_struct_vec_t> numeric_ptr;
			shared_ptr<char_vec_t> charvec_ptr;
			shared_ptr<uint16_t_vec_t> uint16vec_ptr;
		};

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

			storage.ReassignStorage(other.storage);

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
		DatumStorage storage;
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
		void reserveVarChar(const Local<Value> & p, int precision);
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

class nodeTypeCounter
{
public:
	void Decode(v8::Local<v8::Value> p)
	{
		if (p->IsNull()) {
			++nullCount;
		}
		else if (p->IsString()) {
			++stringCount;
		}
		else if (p->IsBoolean()) {
			++boolCount;
		}
		else if (p->IsInt32()) {
			++int32Count;
		}
		else if (p->IsUint32()) {
			++uint32Count;
		}
		else if (p->IsNumber()) {
			double d = p->NumberValue();
			if (_isnan(d)) ++nanCount;
			else if (!_finite(d)) ++infiniteCount;
			if (d == floor(d) &&
				d >= std::numeric_limits<int32_t>::min() &&
				d <= std::numeric_limits<int32_t>::max()) {
				++int32Count;
			}
			else if (d == floor(d) &&
				d >= std::numeric_limits<int64_t>::min() &&
				d <= std::numeric_limits<int64_t>::max()) {
				++int64Count;
			}
			else ++numberCount;
		}
		else if (p->IsDate()) {
			++dateCount;
		}
		else if (p->IsObject() && node::Buffer::HasInstance(p)) {
			++bufferCount;
		}
		else {
			++invalidCount;
		}
	}

	int getoutBoundsCount() const { return nanCount + infiniteCount; }

	int boolCount = 0;
	int stringCount = 0;
	int nullCount = 0;
	int int32Count = 0;
	int uint32Count = 0;
	int numberCount = 0;
	int dateCount = 0;
	int bufferCount = 0;
	int invalidCount = 0;
	int nanCount = 0;
	int infiniteCount = 0;
	int int64Count = 0;
};
