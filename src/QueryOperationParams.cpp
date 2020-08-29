#include <QueryOperationParams.h>
#include <MutateJS.h>
#include "stdafx.h"

namespace mssql
{
	using namespace std;
	using namespace v8;

	QueryOperationParams::QueryOperationParams(const Local<Number> query_id, const Local<Object> query_object)
	{
		const auto qs = Nan::Get(query_object, Nan::New("query_str").ToLocalChecked()).ToLocalChecked();
		const auto maybe_value = Nan::To<String>(qs);
		const auto str = maybe_value.FromMaybe(Nan::EmptyString());
		const auto str_len = str->Length();
		_query_string = make_shared<vector<uint16_t>>();
		_query_string->reserve(str_len);
		_query_string->resize(str_len);
		_timeout = MutateJS::getint32(query_object, "query_timeout");
		_polling = MutateJS::getbool(query_object, "query_polling");
		_query_tz_adjustment = MutateJS::getint32(query_object, "query_tz_adjustment");
		Nan::DecodeWrite(reinterpret_cast<char*>(_query_string->data()),static_cast<size_t>(str->Length()*2), str, Nan::UCS2);
		_id = MutateJS::getint32(query_id);
	}
}
