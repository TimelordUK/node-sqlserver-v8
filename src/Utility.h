//---------------------------------------------------------------------------------------------------------------------------------
// File: Utility.h
// Contents: Utility functions used in Microsoft Driver for Node.js for SQL Server
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
#include <v8.h>
#include <sstream>
#include <map>
#include <mutex>
#include <ctime>

namespace mssql
{
    using namespace std;
    using namespace v8;

	shared_ptr<vector<uint16_t>> js2u16(Local<String> str);
	vector<SQLWCHAR> wstr2wcvec(const wstring & s);
	vector<SQLWCHAR> str2wcvec(const string & cs);
	string swcvec2str(vector<SQLWCHAR> &v, size_t l);
    string w2sqlc(const wstring & s);
	wstring s2ws(const string & s);
    wstring FromV8String(Local<String> input);
	void encode_numeric_struct(double v, int precision, int upscale_limit, SQL_NUMERIC_STRUCT & numeric);

    struct nodeTypeFactory
    {
	   static const int64_t NANOSECONDS_PER_MS = 1000000;

	   Isolate *isolate;

	   nodeTypeFactory();
	   Local<Integer> new_long(int64_t i) const;
	   Local<Integer> new_int32(int32_t i) const;
	   Local<Number> new_int64(int64_t i) const;
	   Local<Value> new_number() const;
	   Local<String> new_string(const char *cstr) const;
	   Local<String> new_string(const char *cstr, int size) const;
	   Local<Array> new_array() const;
	   Local<Array> new_array(int count) const;
	   Local<Value> new_buffer(int size) const;
	   Local<Object> error(const stringstream &full_error) const;
	   Local<Object> error(const char* full_error) const;
	   Local<Value> new_date() const;
	   Local<Value> new_date(double milliseconds, int32_t nanoseconds_delta) const;
	   Local<Value> global() const;
	   Local<Primitive> null() const;
	   Local<Primitive> undefined() const;
	   void throwError(const char * err) const;
	};
}
