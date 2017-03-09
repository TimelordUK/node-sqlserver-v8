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
	OdbcHandle::OdbcHandle(SQLSMALLINT ht) 
		: 
		HandleType(ht), 
		handle(nullptr)
	{
		//fprintf(stderr, "OdbcHandle::OdbcHandle %i\n", HandleType);
	}

	OdbcHandle::~OdbcHandle()
	{
		Free();
	}

	bool OdbcHandle::Alloc()
	{
		assert(handle == SQL_NULL_HANDLE);
		auto ret = SQLAllocHandle(HandleType, nullptr, &handle);
		if (!SQL_SUCCEEDED(ret))
		{
			handle = nullptr;
			return false;
		}
		return true;
	}
	
	bool OdbcHandle::Alloc(const OdbcHandle parent)
	{
		assert(handle == SQL_NULL_HANDLE);
		auto ret = SQLAllocHandle(HandleType, parent, &handle);
		//fprintf(stderr, "Alloc OdbcHandle %i %p\n", HandleType, handle);
		if (!SQL_SUCCEEDED(ret))
		{
			handle = nullptr;
			return false;
		}
		return true;
	}

	void OdbcHandle::Free()
	{
		if (handle != nullptr)
		{	
			//fprintf(stderr, "destruct OdbcHandle %i %p\n", HandleType, handle);
			SQLFreeHandle(HandleType, handle);
			handle = nullptr;
		}
	}

	SQLHANDLE OdbcHandle::get() const
	{
		return handle;
	} 

	vector<shared_ptr<OdbcError>> OdbcHandle::ReadErrors() const
	{
		vector<shared_ptr<OdbcError>> errors;
		shared_ptr<OdbcError> last;

		SQLSMALLINT   i, MsgLen;
		SQLRETURN      rc2;
		SQLINTEGER    NativeError;
		SQLWCHAR        Msg[SQL_MAX_MESSAGE_LENGTH];
		SQLWCHAR SqlState[6];

		// Get the status records.  
		i = 1;
		while ((rc2 = SQLGetDiagRec(HandleType, handle, i, SqlState, &NativeError, Msg, sizeof(Msg), &MsgLen)) != SQL_NO_DATA) {
			i++;
			auto sqlstate = w2a(SqlState);
			auto message = w2a(Msg);
			last = make_shared<OdbcError>(sqlstate.c_str(), message.c_str(), NativeError);
			errors.push_back(last);
		}
		return  errors;
	}
}
