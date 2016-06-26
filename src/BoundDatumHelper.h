#pragma once
// undo these tokens to use numeric_limits below

#undef min
#undef max

#include <TimestampColumn.h>
#include <limits>

namespace mssql
{
	using namespace std;

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

		void ReserveInt32(size_t len)
		{
			int32vec_ptr = make_shared<int32_vec_t>(len);
		}

		void ReserveUInt32(size_t len)
		{
			uint32vec_ptr = make_shared<uint32_vec_t>(len);
		}

		void ReserveInt64(size_t len)
		{
			int64vec_ptr = make_shared<int64_vec_t>(len);
		}

		void ReserveDouble(size_t len)
		{
			doublevec_ptr = make_shared<double_vec_t>(len);
		}

		void ReserveTimestamp(size_t len)
		{
			timestampvec_ptr = make_shared<timestamp_struct_vec_t>(len);
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
}
