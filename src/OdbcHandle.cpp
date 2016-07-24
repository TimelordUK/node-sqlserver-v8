//---------------------------------------------------------------------------------------------------------------------------------
// File: OdbcHandle.cpp
// Contents: Object to manage ODBC handles
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

#include "OdbcHandle.h"
#include "stdafx.h"

namespace mssql
{
	OdbcHandle::OdbcHandle(SQLSMALLINT ht) : HandleType(ht), handle(nullptr)
	{
	}

	OdbcHandle::~OdbcHandle()
	{
		Free();
	}

	bool OdbcHandle::Alloc()
	{
		assert(handle == SQL_NULL_HANDLE);
		SQLRETURN ret = SQLAllocHandle(HandleType, nullptr, &handle);
		if (!SQL_SUCCEEDED(ret))
		{
			return false;
		}
		return true;
	}
	
	bool OdbcHandle::Alloc(const OdbcHandle parent)
	{
		assert(handle == SQL_NULL_HANDLE);
		SQLRETURN ret = SQLAllocHandle(HandleType, parent, &handle);
		if (!SQL_SUCCEEDED(ret))
		{
			return false;
		}
		return true;
	}

	void OdbcHandle::Free()
	{
		if (handle != nullptr)
		{
			handle = nullptr;
			SQLFreeHandle(HandleType, handle);
		}
	}

	SQLHANDLE OdbcHandle::get() const
	{
		return handle;
	} 

	shared_ptr<OdbcError> OdbcHandle::LastError(void) const
	{
		vector<wchar_t> buffer;

		SQLWCHAR wszSqlState[6];
		SQLINTEGER nativeError;
		SQLSMALLINT actual;

		SQLRETURN ret = SQLGetDiagRec(HandleType, handle, 1, wszSqlState, &nativeError, nullptr, 0, &actual);
		assert(ret != SQL_INVALID_HANDLE);
		assert(ret != SQL_NO_DATA);
		assert(SQL_SUCCEEDED(ret));

		buffer.resize(actual + 1);
		ret = SQLGetDiagRec(HandleType, handle, 1, wszSqlState, &nativeError, &buffer[0], actual + 1, &actual);
		assert(SQL_SUCCEEDED(ret));

		string sqlstate = w2a(wszSqlState);
		string message = w2a(buffer.data());
		return make_shared<OdbcError>(sqlstate.c_str(), message.c_str(), nativeError);
	}
}
