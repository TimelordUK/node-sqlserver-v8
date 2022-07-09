#include <QueryOperationParams.h>
#include <MutateJS.h>
#include "stdafx.h"

namespace mssql
{
	using namespace std;
	using namespace v8;

/*
shared_ptr<vector<uint16_t>> _query_string;
		int32_t _timeout;
		int32_t _query_tz_adjustment;
		int64_t _id;
		size_t _max_prepared_column_size;
		bool _numeric_string;
		bool _polling;
*/
	QueryOperationParams::QueryOperationParams(const Local<Number> query_id, 
		const Local<Object> query_object) :
		_timeout(MutateJS::getint32(query_object, "query_timeout")),
		_id(MutateJS::getint32(query_id)),
		_max_prepared_column_size(MutateJS::getint64(query_object, "max_prepared_column_size")),
		_numeric_string(MutateJS::getbool(query_object, "numeric_string")),
		_polling(MutateJS::getbool(query_object, "query_polling"))
	{
		const auto qs = Nan::Get(query_object, Nan::New("query_str").ToLocalChecked()).ToLocalChecked();
		const auto maybe_value = Nan::To<String>(qs);
		const auto str = maybe_value.FromMaybe(Nan::EmptyString());

		_query_string = js2u16(str);
	}
}
