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

namespace mssql
{
	
	using namespace v8;

	bufferPoolChar_t::elements_t bufferPoolChar_t::elements_map;
	int bufferPoolChar_t::_id = 0;
	mutex bufferPoolChar_t::g_i_mutex;

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
}
