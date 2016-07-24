//---------------------------------------------------------------------------------------------------------------------------------
// File: Utility.cpp
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

#include "stdafx.h"
#include <BoundDatumHelper.h>

namespace mssql
{
	using namespace v8;

	wstring FromV8String(Handle<String> input)
	{
		wstring result;
		const int bufferLength = 256;
		uint16_t buffer[bufferLength];
		int length = input->Length();
		result.reserve(length);
		int read = 0;
		while (read < length)
		{
			int toread = min(bufferLength, length - read);
			int actual = input->Write(buffer, read, toread);
			result.append(reinterpret_cast<const wchar_t*>(buffer), actual);
			read += actual;
		}

		return result;
	}

	string w2a(const wchar_t* input)
	{
		vector<char> messageBuffer;
		int length = ::WideCharToMultiByte(CP_UTF8, 0, input, -1, nullptr, 0, nullptr, nullptr);
		if (length > 0)
		{
			// length includes null terminator
			messageBuffer.resize(length);
			::WideCharToMultiByte(CP_UTF8, 0, input, -1, messageBuffer.data(), static_cast<int>(messageBuffer.size()), nullptr, nullptr);
		}
		return string(messageBuffer.data());
	}

	int char2int(char input)
	{
		if (input >= '0' && input <= '9')
			return input - '0';
		if (input >= 'A' && input <= 'F')
			return input - 'A' + 10;
		if (input >= 'a' && input <= 'f')
			return input - 'a' + 10;
		throw invalid_argument("Invalid input string");
	}

	// This function assumes src to be a zero terminated sanitized string with
	// an even number of [0-9a-f] characters, and target to be sufficiently large

	int hex2bin(const char* src, char* target)
	{
		int len = 0;
		while (*src && src[1])
		{
			*(target++) = char2int(*src) * 16 + char2int(src[1]);
			src += 2;
			++len;
		}
		return len;
	}

	double round(double val, int dp)
	{
		double raised = pow(10, dp);
		double temp = val * raised;
		double rounded = floor(temp);

		if (temp - rounded >= .5) {
			rounded = ceil(temp);
		}

		return rounded / raised;
	}

	string hexify(unsigned long long n)
	{
		string res;

		do
		{
			res += "0123456789ABCDEF"[n % 16];
			n >>= 4;
		} while (n);

		return string(res.rbegin(), res.rend());
	}

	void encodeNumericStruct(double v, int precision, int upscaleLimit, SQL_NUMERIC_STRUCT & numeric) {

		double encode = fabs(v);
		double intpart;
		int scale = 0;
		char hex[SQL_MAX_NUMERIC_LEN];

		if (upscaleLimit <= 0) upscaleLimit = SQL_MAX_NUMERIC_LEN;

		double dmod = modf(encode, &intpart);
		while (scale < upscaleLimit && dmod != 0.0)
		{
			++scale;
			encode = encode * 10;
			dmod = modf(encode, &intpart);
		}

		auto ull = static_cast<unsigned long long>(encode);
		memset(numeric.val, 0, SQL_MAX_NUMERIC_LEN);
		memset(hex, 0, SQL_MAX_NUMERIC_LEN);
		auto ss = hexify(ull);
		if (ss.size() % 2 == 1) ss = "0" + ss;
		auto len = hex2bin(ss.c_str(), hex);
		int j = 0;
		for (int i = len - 1; i >= 0; --i)
		{
			numeric.val[j++] = hex[i];
		}

		numeric.sign = v >= 0.0 ? 1 : 0;
		numeric.precision = precision > 0 ? precision : static_cast<SQLCHAR>(log10(encode) + 1);
		numeric.scale = min(upscaleLimit, scale);
	}


	nodeTypeFactory::nodeTypeFactory()
	{
		isolate = Isolate::GetCurrent();
	}

	Local<Number> nodeTypeFactory::newNumber(double d) const
	{
		return Number::New(isolate, d);
	}

	void nodeTypeFactory::scopedCallback(const Persistent<Function> & callback, int argc, Local<Value> args[]) const
	{
		auto cons = newCallbackFunction(callback);
		auto context = isolate->GetCurrentContext();
		auto global = context->Global();
		cons->Call(global, argc, args);
	}

	Local<Integer> nodeTypeFactory::newInteger(int32_t i) const
	{
		return Integer::New(isolate, i);
	}

	Local<Integer> nodeTypeFactory::newLong(int64_t i) const
	{
		return Integer::New(isolate, static_cast<int32_t>(i));
	}

	Local<Boolean> nodeTypeFactory::newBoolean(bool b) const
	{
		return Boolean::New(isolate, b);
	}

	Local<Boolean> nodeTypeFactory::newBoolean(uint16_t n) const
	{
		return Boolean::New(isolate, n != 0 ? true : false);
	}

	Local<Integer> nodeTypeFactory::newInt32(int32_t i) const
	{
		return Int32::New(isolate, i);
	}

	Local<Number> nodeTypeFactory::newInt64(int64_t i) const
	{
		return Number::New(isolate, static_cast<double>(i));
	}

	Local<Object> nodeTypeFactory::newObject() const
	{
		return Object::New(isolate);
	}

	Local<Value> nodeTypeFactory::newNumber() const
	{
		return Object::New(isolate);
	}

	Local<Integer> nodeTypeFactory::newUint32(uint32_t n) const
	{
		return Integer::New(isolate, n);
	}

	Local<String> nodeTypeFactory::newString(const char *cstr) const
	{
		return String::NewFromUtf8(isolate, cstr);
	}

	Local<String> nodeTypeFactory::newString(const char *cstr, int size) const
	{
		return String::NewFromUtf8(isolate, cstr, String::NewStringType::kNormalString, size);
	}

	Local<Array> nodeTypeFactory::newArray() const
	{
		return Array::New(isolate);
	}

	Local<Array> nodeTypeFactory::newArray(int count) const
	{
		return Array::New(isolate, count);
	}

	Local<Value> nodeTypeFactory::newLocalValue(const Handle<Value> & v) const
	{
		return Local<Value>::New(isolate, v);
	}

	Local<Function> nodeTypeFactory::newCallbackFunction(const Persistent<Function> & callback) const
	{
		return Local<Function>::New(isolate, callback);
	}

	Local<FunctionTemplate> nodeTypeFactory::newTemplate(const FunctionCallback & callback) const
	{
		return FunctionTemplate::New(isolate, callback);
	}

	Local<Object> nodeTypeFactory::newObject(const Persistent <Object> & bp) const
	{
		return Local<Object>::New(isolate, bp);
	}

	Local<Value> nodeTypeFactory::fromTwoByte(const wchar_t* text) const
	{
		return String::NewFromTwoByte(isolate, reinterpret_cast<const uint16_t*>(text));
	}

	Local<Value> nodeTypeFactory::fromTwoByte(const uint16_t* text) const
	{
		return String::NewFromTwoByte(isolate, text);
	}

	Local<Value> nodeTypeFactory::fromTwoByte(const uint16_t* text, size_t size) const
	{
		return String::NewFromTwoByte(isolate, text, String::NewStringType::kNormalString, static_cast<int>(size));
	}

	Local<Value> nodeTypeFactory::newBuffer(int size) const
	{
		return node::Buffer::New(isolate, size)
#ifdef NODE_GYP_V4 
			.ToLocalChecked()
#endif
			;
	}

	Local<Object> nodeTypeFactory::error(const stringstream &full_error) const
	{
		auto err = Local<Object>::Cast(Exception::Error(newString(full_error.str().c_str())));
		return err;
	}

	Local<Object> nodeTypeFactory::error(const char* full_error) const
	{
		auto err = Local<Object>::Cast(Exception::Error(newString(full_error)));
		return err;
	}

	Local<Value> nodeTypeFactory::newDate() const
	{
		auto dd = Date::New(isolate, 0.0);
		return dd;
	}

	Local<Value> nodeTypeFactory::newDate(double milliseconds, int32_t nanoseconds_delta) const
	{
		auto ns = String::NewFromUtf8(isolate, "nanosecondsDelta");
		auto n = Number::New(isolate, nanoseconds_delta / (NANOSECONDS_PER_MS * 1000.0));
		// include the properties for items in a DATETIMEOFFSET that are not included in a JS Date object
		auto dd = Date::New(isolate, milliseconds);
		dd->ToObject()->Set(ns, n);
		return dd;
	}

	Local<Value> nodeTypeFactory::global() const
	{
		return isolate->GetCurrentContext()->Global();
	}

	Handle<Primitive> nodeTypeFactory::null() const
	{
		return Null(isolate);
	}

	Handle<Primitive> nodeTypeFactory::undefined() const
	{
		return Undefined(isolate);
	}

	void nodeTypeFactory::throwError(const char * err) const
	{
		isolate->ThrowException(error(err));
	}
}