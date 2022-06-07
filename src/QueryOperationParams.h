#pragma once

#include <stdafx.h>

namespace mssql
{
	using namespace std;
	using namespace v8;

	class QueryOperationParams
	{
	public:
		shared_ptr<vector<uint16_t>> query_string() { return _query_string; }
		int64_t id() { return _id; }
		int32_t timeout() { return _timeout; }
		int32_t query_tz_adjustment() { return _query_tz_adjustment; }
		size_t max_prepared_column_size() { return _max_prepared_column_size; }
		bool polling() { return _polling; }
		bool numeric_string() { return _numeric_string; }
	
		QueryOperationParams(Local<Number> query_id, Local<Object> query_object);
	private:
		shared_ptr<vector<uint16_t>> _query_string;
		int32_t _timeout;
		int32_t _query_tz_adjustment;
		int64_t _id;
		size_t _max_prepared_column_size;
		bool _numeric_string;
		bool _polling;
	};
}
