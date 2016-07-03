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

namespace mssql
{
    using namespace std;
    using namespace v8;

    inline Local<String> New(const wchar_t* text)
    {
	   return String::NewFromTwoByte(Isolate::GetCurrent(), reinterpret_cast<const uint16_t*>(text));
    }

    wstring FromV8String(Handle<String> input);
	void encodeNumericStruct(double v, int precision, int upscaleLimit, SQL_NUMERIC_STRUCT & numeric);

    string w2a(const wchar_t* input);

    struct nodeTypeFactory
    {
	   static const int64_t NANOSECONDS_PER_MS = 1000000;

	   Isolate *isolate;

	   nodeTypeFactory();
	   Local<Number> newNumber(double d) const;
	   void scopedCallback(const Persistent<Function> & callback, int argc, Local<Value> args[]) const;
	   Local<Integer> newInteger(int32_t i) const;
	   Local<Integer> newLong(int64_t i) const;
	   Local<Boolean> newBoolean(bool b) const;
	   Local<Boolean> newBoolean(uint16_t n) const;
	   Local<Integer> newInt32(int32_t i) const;
	   Local<Number> newInt64(int64_t i) const;
	   Local<Object> newObject() const;
	   Local<Value> newNumber() const;
	   Local<Integer> newUint32(uint32_t n) const;
	   Local<String> newString(const char *cstr) const;
	   Local<String> newString(const char *cstr, int size) const;
	   Local<Array> newArray() const;
	   Local<Array> newArray(int count) const;
	   Local<Value> newLocalValue(const Handle<Value> & v) const;
	   Local<Function> newCallbackFunction(const Persistent<Function> & callback) const;
	   Local<FunctionTemplate> newTemplate(const FunctionCallback & callback) const;
	   Local<Object> newObject(const Persistent <Object> & bp) const;
	   Local<Value> fromTwoByte(const wchar_t* text) const;
	   Local<Value> fromTwoByte(const uint16_t* text) const;
	   Local<Value> fromTwoByte(const uint16_t* text, size_t size) const;
	   Local<Value> newBuffer(int size) const;
	   Local<Object> error(const stringstream &full_error) const;
	   Local<Object> error(const char* full_error) const;
	   Local<Value> newDate() const;
	   Local<Value> newDate(double milliseconds, int32_t nanoseconds_delta) const;
	   Local<Value> global() const;
	   Handle<Primitive> null() const;
	   Handle<Primitive> undefined() const;
	   void throwError(const char * err) const;
	};
}
