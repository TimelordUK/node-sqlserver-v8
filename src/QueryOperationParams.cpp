#include <QueryOperationParams.h>
#include <MutateJS.h>
#include "stdafx.h"

namespace mssql
{
	using namespace std;
	using namespace v8;

	QueryOperationParams::QueryOperationParams(const Local<Number> query_id, 
		const Local<Object> query_object) :
		_timeout(MutateJS::getint32(query_object, "query_timeout")),
		_query_tz_adjustment(MutateJS::getint32(query_object, "query_tz_adjustment")),
		_id(MutateJS::getint32(query_id)),
		_polling(MutateJS::getbool(query_object, "query_polling")),
		_numeric_string(MutateJS::getbool(query_object, "numeric_string"))
	{
		const auto qs = Nan::Get(query_object, Nan::New("query_str").ToLocalChecked()).ToLocalChecked();
		const auto maybe_value = Nan::To<String>(qs);
		const auto str = maybe_value.FromMaybe(Nan::EmptyString());

		_query_string = js2u16(str);
	}
}
