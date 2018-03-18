//---------------------------------------------------------------------------------------------------------------------------------
// File: OdbcOperation.h
// Contents: ODBC Operation objects called on background thread
// 
// Copyright Microsoft Corporation and contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
//
// You may obtain a copy of the License at:
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//---------------------------------------------------------------------------------------------------------------------------------

#pragma once

#include <stdafx.h>

namespace mssql
{
	using namespace std;
	using namespace v8;

	class QueryOperationParams
	{
	public:

		wstring query_string() { return _query_string; }
		int64_t id() { return _id; }
		int32_t timeout() { return _timeout; }
		int32_t query_tz_adjustment() { return _query_tz_adjustment; }
		bool polling() { return _polling; }

		QueryOperationParams(Handle<Number> query_id, Handle<Object> query_object)
		{
			_query_string = FromV8String(get(query_object, "query_str")->ToString());
			_timeout = get(query_object, "query_timeout")->Int32Value();
			_polling = get(query_object, "query_polling")->BooleanValue();
			_query_tz_adjustment = get(query_object, "query_tz_adjustment")->Int32Value();
			_id = query_id->IntegerValue();
		}

	private:
		Local<Value> get(Local<Object> o, const char *v)
		{
			nodeTypeFactory fact;
			const auto vp = fact.new_string(v);
			const auto val = o->Get(vp);
			return val;
		}

		wstring _query_string;
		int32_t _timeout;
		int32_t _query_tz_adjustment;
		int64_t _id;
		bool _polling;
	};
}

