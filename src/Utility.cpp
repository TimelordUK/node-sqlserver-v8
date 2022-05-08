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
#include <cstring>
#include <locale>
#include <codecvt>
#include <nan.h>

namespace mssql
{
	using namespace v8;

	string swcvec2str(vector<SQLWCHAR> &v, const size_t l)
	{
		vector<char> c_str;
		c_str.reserve(l + 1);
		c_str.resize(l + 1);
		constexpr auto c = static_cast<int>(sizeof(SQLWCHAR));
		const auto *ptr = reinterpret_cast<const char *>(v.data());
		for (size_t i = 0, j = 0; i < l * c; i += c, j++)
		{
			c_str[j] = ptr[i];
		}
		if (l > 0)
			c_str.resize(l - 1);
		string s(c_str.data());
		return s;
	}

	shared_ptr<vector<uint16_t>> js2u16(Local<String> str)
	{
		const auto str_len = str->Length();
		auto query_string = make_shared<vector<uint16_t>>();
		query_string->reserve(str_len);
		query_string->resize(str_len);
		Nan::DecodeWrite(reinterpret_cast<char *>(query_string->data()),
						 static_cast<size_t>(str->Length() * 2),
						 str, Nan::UCS2);
		return query_string;
	}

	vector<SQLWCHAR> wstr2wcvec(const wstring &s)
	{
		const auto cs = w2sqlc(s);
		return str2wcvec(cs);
	}

	vector<SQLWCHAR> str2wcvec(const string &cs)
	{
		vector<SQLWCHAR> ret;
		ret.resize(cs.size());
		ret.reserve(cs.size());
		auto wptr = ret.begin();
		for (auto ptr = cs.begin(); ptr != cs.end(); ++ptr, ++wptr)
		{
			*wptr = *ptr;
		}
		return ret;
	}

	string w2sqlc(const wstring &s)
	{
		std::wstring_convert<std::codecvt_utf8<wchar_t>> converter;
		auto c_cs = converter.to_bytes(s);
		return c_cs;
	}

	wstring s2ws(const string &s)
	{
		using convert_type = codecvt_utf8<wchar_t>;
		wstring_convert<convert_type, wchar_t> converter;
		const auto c_cs = converter.from_bytes(s);
		return wstring{c_cs};
	}

	wstring FromV8String(const Local<String> input)
	{

		Nan::Utf8String cons(input);
		const auto *x = *cons;
		const string cc = x;
		auto wides = s2ws(cc);
		return wides;
	}

	int char2_int(const char input)
	{
		if (input >= '0' && input <= '9')
			return input - '0';
		if (input >= 'A' && input <= 'F')
			return input - 'A' + 10;
		if (input >= 'a' && input <= 'f')
			return input - 'a' + 10;
		// throw invalid_argument("Invalid input string");
		return 0;
	}

	// This function assumes src to be a zero terminated sanitized string with
	// an even number of [0-9a-f] characters, and target to be sufficiently large

	int hex2_bin(const char *src, char *target)
	{
		auto len = 0;
		while (*src && src[1])
		{
			*target++ = static_cast<char>(char2_int(*src) * 16 + char2_int(src[1]));
			src += 2;
			++len;
		}
		return len;
	}

	double round(const double val, const int dp)
	{
		const auto raised = pow(10, dp);
		const auto temp = val * raised;
		auto rounded = floor(temp);

		if (temp - rounded >= .5)
		{
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

		return string{res.rbegin(), res.rend()};
	}

	long strtohextoval(const SQL_NUMERIC_STRUCT &numeric)
	{
		long val = 0;
		long value = 0;
		int i = 1, last = 1, current;
		int a = 0, b = 0;
		for (i = 0; i <= 15; i++)
		{
			current = (int)numeric.val[i];
			a = current % 16; // Obtain LSD
			b = current / 16; // Obtain MSD

			value += last * a;
			last = last * 16;
			value += last * b;
			last = last * 16;
		}
		return value;
	}

	double decode_numeric_struct(const SQL_NUMERIC_STRUCT &numeric)
	{
		// Call to convert the little endian mode data into numeric data.

		auto myvalue = strtohextoval(numeric);

		// The returned value in the above code is scaled to the value specified
		// in the scale field of the numeric structure. For example 25.212 would
		// be returned as 25212. The scale in this case is 3 hence the integer
		// value needs to be divided by 1000.

		auto divisor = 1;
		if (numeric.scale > 0)
		{
			for (auto i = 0; i < numeric.scale; i++) {
				divisor = divisor * 10;
			}
		}
		auto final_val = (double)myvalue / (double)divisor;
		return final_val;
	}

	void encode_numeric_struct(const double v, const int precision, int upscale_limit, SQL_NUMERIC_STRUCT & numeric) {
		auto encode = fabs(v);
		double intpart;
		auto scale = 0;
		char hex[SQL_MAX_NUMERIC_LEN];

		if (upscale_limit <= 0) upscale_limit = SQL_MAX_NUMERIC_LEN;

		auto dmod = modf(encode, &intpart);
		while (scale < upscale_limit && dmod != 0.0)
		{
			++scale;
			encode = encode * 10;
			dmod = modf(encode, &intpart);
		}

		const auto ull = static_cast<unsigned long long>(encode);
		memset(numeric.val, 0, SQL_MAX_NUMERIC_LEN);
		memset(hex, 0, SQL_MAX_NUMERIC_LEN);
		auto ss = hexify(ull);
		if (ss.size() % 2 == 1) ss = "0" + ss;
		const auto len = hex2_bin(ss.c_str(), hex);
		auto j = 0;
		for (auto i = len - 1; i >= 0; --i)
		{
			numeric.val[j++] = hex[i];
		}

		numeric.sign = v >= 0.0 ? 1 : 0;
		numeric.precision = precision > 0 ? static_cast<SQLCHAR>(precision) : static_cast<SQLCHAR>(log10(encode) + 1);
		numeric.scale = static_cast<SQLSCHAR>(min(upscale_limit, scale));
	}


	nodeTypeFactory::nodeTypeFactory()
	{
		isolate = Isolate::GetCurrent();
	}

	Local<Integer> nodeTypeFactory::new_long(const int64_t i) const
	{
		return Nan::New(static_cast<int32_t>(i));
	}

	Local<Integer> nodeTypeFactory::new_int32(const int32_t i) const
	{
		return Nan::New<Int32>(i);
	}

	Local<Number> nodeTypeFactory::new_int64(const int64_t i) const
	{
		return Nan::New<Number>(static_cast<double>(i));
	}

	Local<Value> nodeTypeFactory::new_number() const
	{
		return Object::New(isolate);
	}

	Local<String> nodeTypeFactory::new_string(const char *cstr) const
	{
		return Nan::New(cstr).ToLocalChecked();
	}

	Local<String> nodeTypeFactory::new_string(const char *cstr, const int size) const
	{
		return Nan::New<String>(cstr, size).ToLocalChecked();
	}

	Local<Array> nodeTypeFactory::new_array() const
	{
		return Nan::New<Array>();
	}

	Local<Array> nodeTypeFactory::new_array(const int count) const
	{
		return Array::New(isolate, count);
	}

	Local<Value> nodeTypeFactory::new_buffer(const int size) const
	{
		return Nan::NewBuffer(size).ToLocalChecked();
	}

	Local<Object> nodeTypeFactory::error(const stringstream &full_error) const
	{
		const auto err = Local<Object>::Cast(Exception::Error(new_string(full_error.str().c_str())));
		return err;
	}

	Local<Object> nodeTypeFactory::error(const char *full_error) const
	{
		const auto err = Local<Object>::Cast(Exception::Error(new_string(full_error)));
		return err;
	}

	Local<Value> nodeTypeFactory::new_date() const
	{
		return Nan::New<Date>(0.0).ToLocalChecked();
	}

	Local<Value> nodeTypeFactory::new_date(const double milliseconds, const int32_t nanoseconds_delta) const
	{
		const auto ns = Nan::New<String>("nanosecondsDelta").ToLocalChecked();
		const auto n = Nan::New<Number>(nanoseconds_delta / (NANOSECONDS_PER_MS * 1000.0));
		// include the properties for items in a DATETIMEOFFSET that are not included in a JS Date object
		const auto d = Nan::New<Date>(milliseconds).ToLocalChecked();
		Nan::Set(d, ns, n);
		return d;
	}

	Local<Value> nodeTypeFactory::global() const
	{
		return isolate->GetCurrentContext()->Global();
	}

	Local<Primitive> nodeTypeFactory::null() const
	{
		return Nan::Null();
	}

	Local<Primitive> nodeTypeFactory::undefined() const
	{
		return Undefined(isolate);
	}

	void nodeTypeFactory::throwError(const char *err) const
	{
		isolate->ThrowException(error(err));
	}
}