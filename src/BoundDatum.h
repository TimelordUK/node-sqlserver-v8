#pragma once
// undo these tokens to use numeric_limits below
#undef min
#undef max

namespace mssql
{
	using namespace std;

	class BoundDatum {
	public:
		bool bind(Local<Value> &p);
		Local<Value> unbind() const;
		vector<SQLLEN> & getIndVec() { return indvec; }
		char *getErr() const { return err;  }

		BoundDatum(void) :
			js_type(JS_UNKNOWN),
			c_type(0),
			sql_type(0),
			param_size(0),
			digits(0),
			buffer(nullptr),
			buffer_len(0),
			param_type(SQL_PARAM_INPUT),
			doublevec_ptr(nullptr),
			uint16vec_ptr(nullptr),
			int32vec_ptr(nullptr),
			uint32vec_ptr(nullptr),
			int64vec_ptr(nullptr),
			timevec_ptr(nullptr), 
			charvec_ptr(nullptr),
			err(nullptr)
		{
			indvec = vector<SQLLEN>(1);
		}

		void ReassignStorage(BoundDatum&other)
		{
			doublevec_ptr = other.doublevec_ptr;
			uint16vec_ptr = other.uint16vec_ptr;
			int32vec_ptr = other.int32vec_ptr;
			uint32vec_ptr = other.uint32vec_ptr;
			int64vec_ptr = other.int64vec_ptr;
			timevec_ptr = other.timevec_ptr;
			charvec_ptr = other.charvec_ptr;

			other.charvec_ptr = nullptr;
			other.buffer = nullptr;
			other.doublevec_ptr = nullptr;
			other.uint16vec_ptr = nullptr;
			other.int32vec_ptr = nullptr;
			other.uint32vec_ptr = nullptr;
			other.int64vec_ptr = nullptr;
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

			ReassignStorage(other);

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

	private:
	
		vector<SQLLEN> indvec;

		shared_ptr<vector<char>> charvec_ptr;
		shared_ptr<vector<uint16_t>> uint16vec_ptr;
		shared_ptr<vector<int32_t>> int32vec_ptr;
		shared_ptr<vector<uint32_t>> uint32vec_ptr;
		shared_ptr<vector<int64_t>> int64vec_ptr;
		shared_ptr<vector<double>> doublevec_ptr;
		shared_ptr<vector<SQL_SS_TIMESTAMPOFFSET_STRUCT>> timevec_ptr;

		char * err;

		void bindNull(const Local<Value> & p);
		void bindNullArray(const Local<Value> & p);
		void bindNull(SQLLEN len);

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
		void bindDefaultArray(const Local<Value> & p);

		bool bindDatumType(Local<Value>& p);
		bool bind(Local<Object> o, const char* if_str, uint16_t type);
		bool bindObject(Local<Value> &p);
		bool bindArray(Local<Value> &p);
		
		bool procBind(Local<Value> &p, Local<Value> &v);
		bool userBind(Local<Value> &p, Local<Value> &v);

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
