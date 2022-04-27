#pragma once
// undo these tokens to use numeric_limits below

#undef min
#undef max

#include <limits>
#include <vector>
#include <string.h>

#ifdef LINUX_BUILD
#include <cmath>
#include <cfloat>
#endif

namespace mssql
{
	using namespace std;

	class DatumStorage
	{
	public:

		typedef long long int bigint_t; 
		typedef vector<uint16_t> uint16_t_vec_t;
		typedef vector<shared_ptr<uint16_t_vec_t>> uint16_vec_t_vec_t;
		typedef vector<char> char_vec_t;
		typedef vector<shared_ptr<char_vec_t>> char_vec_t_vec_t;
		typedef vector<int16_t> int16_vec_t;
		typedef vector<int32_t> int32_vec_t;
		typedef vector<uint32_t> uint32_vec_t;
		typedef vector<int64_t> int64_vec_t;
		typedef vector<double> double_vec_t;
		typedef vector<bigint_t> bigint_vec_t;
		typedef vector<SQL_SS_TIMESTAMPOFFSET_STRUCT> timestamp_offset_vec_t;
		typedef vector<SQL_SS_TIME2_STRUCT> time2_struct_vec_t;
		typedef vector<SQL_TIMESTAMP_STRUCT> timestamp_struct_vec_t;
		typedef vector<SQL_DATE_STRUCT> date_struct_vec_t;
		typedef vector<SQL_NUMERIC_STRUCT> numeric_struct_vec_t;

		DatumStorage() :
			int16vec_ptr(nullptr),
			int32vec_ptr(nullptr),
			uint32vec_ptr(nullptr),
			int64vec_ptr(nullptr),
			doublevec_ptr(nullptr),
			timestampoffsetvec_ptr(nullptr),
			time2vec_ptr(nullptr),
			timestampvec_ptr(nullptr),
			datevec_ptr(nullptr),
			numeric_ptr(nullptr),
			charvec_ptr(nullptr),
			uint16vec_ptr(nullptr),
			uint16_vec_vec_ptr(nullptr),
			char_vec_vec_ptr(nullptr),
			bigint_vec_ptr(nullptr)
		{
		}

		template<typename  T>
		inline shared_ptr<vector<T>> reserve_vec(shared_ptr<vector<T>> existing, size_t size)
		{
			if (existing == nullptr) {
				existing = make_shared<vector<T>>(size);
			}
			else
			{
				if (size > existing->capacity()) {
					existing->reserve(size);
				}
			}
			return existing;
		}

		inline bool isNumeric() const {
			return numeric_ptr && !numeric_ptr->empty();
		}

		inline void ReserveNumerics(size_t len)
		{
			numeric_ptr = reserve_vec<SQL_NUMERIC_STRUCT>(numeric_ptr, len);
		}

		inline bool isChar() const {
			return charvec_ptr && !charvec_ptr->empty();
		}

		inline void ReserveChars(size_t len)
		{
			charvec_ptr = reserve_vec<char>(charvec_ptr, len);
		}

		inline bool isBigInt() const {
			return bigint_vec_ptr && !bigint_vec_ptr->empty();
		}

		inline void ReserveBigInt(size_t len)
		{
			bigint_vec_ptr = reserve_vec<bigint_t>(bigint_vec_ptr, len);
		}

		inline void ReserveUint16(size_t len)
		{
			uint16vec_ptr = reserve_vec<uint16_t>(uint16vec_ptr, len);
		}

		inline bool isUint16Vec() const {
			return uint16_vec_vec_ptr && !uint16_vec_vec_ptr->empty();
		}

		inline void ReserveUint16Vec(size_t len)
		{
			uint16_vec_vec_ptr = reserve_vec<shared_ptr<uint16_t_vec_t>>(uint16_vec_vec_ptr, len);
		}

		inline bool isInt32() const {
			return int32vec_ptr  && !int32vec_ptr->empty();
		}

		inline void ReserveInt32(size_t len)
		{
			int32vec_ptr = reserve_vec<int32_t>(int32vec_ptr, len);
		}

		inline bool isInt16() const {
			return int16vec_ptr  && !int16vec_ptr->empty();
		}

		inline void ReserveInt16(size_t len)
		{
			int16vec_ptr = reserve_vec<int16_t>(int16vec_ptr, len);
		}

		inline bool isUInt32() const {
			return uint32vec_ptr  && !uint32vec_ptr->empty();
		}

		inline void ReserveUInt32(size_t len)
		{
			uint32vec_ptr = make_shared<uint32_vec_t>(len);
		}

		inline bool isInt64() const {
			return int64vec_ptr && !int64vec_ptr->empty();
		}

		inline void ReserveInt64(size_t len)
		{
			int64vec_ptr = reserve_vec<int64_t>(int64vec_ptr, len);
		}

		inline bool isDouble() const {
			return doublevec_ptr && !doublevec_ptr->empty();
		}

		inline void ReserveDouble(size_t len)
		{
			doublevec_ptr = reserve_vec<double>(doublevec_ptr, len);
		}

		inline bool isTimestamp() const {
			return timestampvec_ptr && !timestampvec_ptr->empty();
		}

		inline void ReserveTimestamp(size_t len)
		{
			timestampvec_ptr = reserve_vec<SQL_TIMESTAMP_STRUCT>(timestampvec_ptr, len);
		}

		inline bool isTime2() const {
			return time2vec_ptr && !time2vec_ptr->empty();
		}

		inline void Reservetime2(size_t len) {
			time2vec_ptr = reserve_vec<SQL_SS_TIME2_STRUCT>(time2vec_ptr, len);
		}

		inline bool isTimestampOffset() const {
			return timestampoffsetvec_ptr && !timestampoffsetvec_ptr->empty();
		}

		inline void ReserveTimestampOffset(size_t len)
		{
			timestampoffsetvec_ptr = reserve_vec<SQL_SS_TIMESTAMPOFFSET_STRUCT>(timestampoffsetvec_ptr, len);
		}

		inline bool isCharVec() const {
			return char_vec_vec_ptr && !char_vec_vec_ptr->empty();
		}

		inline void ReserveCharVec(size_t len)
		{
			char_vec_vec_ptr = reserve_vec<shared_ptr<char_vec_t>>(char_vec_vec_ptr, len);
		}

		inline bool isDate() const {
			return datevec_ptr && !datevec_ptr->empty();
		}

		inline void ReserveDate(size_t len) {
			datevec_ptr = reserve_vec<SQL_DATE_STRUCT>(datevec_ptr, len);
		}

		shared_ptr<int16_vec_t> int16vec_ptr;
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
		shared_ptr<uint16_vec_t_vec_t> uint16_vec_vec_ptr;
		shared_ptr<char_vec_t_vec_t> char_vec_vec_ptr;
		shared_ptr<bigint_vec_t> bigint_vec_ptr;

		wstring schema;
		wstring table;
	private:

	};

	class nodeTypeCounter
	{
	public:
		void Decode(v8::Local<v8::Value> p)
		{
			nodeTypeFactory fact;
			auto context = fact.isolate->GetCurrentContext();
			if (p->IsNullOrUndefined()) {
				++nullCount;
			}
			else if (p->IsString()) {
				++stringCount;
			}
			else if (p->IsBoolean()) {
				++boolCount;
			}
			else if (p->IsNumber()) {
				MaybeLocal<Number> maybe = p->ToNumber(context);
				Local<Number> local;
				if (maybe.ToLocal(&local))
				{
					auto d = local->Value();
					#ifdef WINDOWS_BUILD
					if (_isnan(d)) ++nanCount;
					#endif
					#ifdef LINUX_BUILD
					if (isnan(d)) ++nanCount;
					#endif
					#ifdef WINDOWS_BUILD
					else if (!_finite(d)) ++infiniteCount;
					#endif
					#ifdef LINUX_BUILD
					else if (!isfinite(d)) ++infiniteCount;
					#endif

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
			}/*
			else if (p->IsBigInt())
			{
				MaybeLocal<BigInt> maybe = p->ToBigInt(context);
				Local<BigInt> local;
				if (maybe.ToLocal(&local))
				{
					++int64Count;
				}
			}*/
			else if (p->IsInt32()) {
				++int32Count;
			}
			else if (p->IsUint32()) {
				++uint32Count;
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