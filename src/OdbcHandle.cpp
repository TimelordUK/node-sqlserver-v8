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

#include <OdbcHandle.h>
#include "stdafx.h"
#include <locale>
#include <set>

namespace mssql
{
	OdbcStatementHandle::~OdbcStatementHandle() {
		// cerr << "OdbcStatementHandle::~OdbcStatementHandle " << _statementId << endl; 
	}

	OdbcHandle::OdbcHandle(const SQLSMALLINT ht) 
		: 
		HandleType(ht), 
		handle(nullptr)
	{
		//fprintf(stderr, "OdbcHandle::OdbcHandle %i\n", HandleType);
	}

	OdbcHandle::~OdbcHandle()
	{
	}

	bool OdbcHandle::alloc()
	{
		assert(handle == SQL_NULL_HANDLE);
		const auto ret = SQLAllocHandle(HandleType, nullptr, &handle);
		if (!SQL_SUCCEEDED(ret))
		{
			handle = nullptr;
			return false;
		}
		return true;
	}
	
	bool OdbcHandle::alloc(const OdbcHandle &parent)
	{
		assert(handle == SQL_NULL_HANDLE);
		const auto ret = SQLAllocHandle(HandleType, parent, &handle);
		//fprintf(stderr, "Alloc OdbcHandle %i %p\n", HandleType, handle);
		if (!SQL_SUCCEEDED(ret))
		{
			handle = nullptr;
			return false;
		}
		return true;
	}

	void OdbcHandle::free()
	{
		if (handle != nullptr)
		{		
			// cerr << "free hande " << HandleType << " handle " << handle << endl;
			//fprintf(stderr, "destruct OdbcHandle %i %p\n", HandleType, handle);
			SQLFreeHandle(HandleType, handle);	
			handle = nullptr;
		}
	}

	SQLHANDLE OdbcHandle::get() const
	{
		return handle;
	} 

	void OdbcHandle::read_errors(shared_ptr<vector<shared_ptr<OdbcError>>> & errors) const
	{
		SQLSMALLINT msg_len = 0;
		SQLRETURN      rc2;
		SQLINTEGER    native_error = 0;
		vector<SQLWCHAR> msg;
		msg.reserve(2 * 1024);
		msg.resize(2 * 1024);
		vector<SQLWCHAR> sql_state;
		sql_state.reserve(6);
		sql_state.resize(6);
		set<string> received;
		int severity = 0;
		SQLSMALLINT serverName_len = 0;
		vector<SQLWCHAR> serverName;
		serverName.reserve(SQL_MAX_SQLSERVERNAME);
		serverName.resize(SQL_MAX_SQLSERVERNAME);
		SQLSMALLINT procName_len = 0;
		vector<SQLWCHAR> procName;
		procName.reserve(128);
		procName.resize(128);
		unsigned int lineNumber = 0;
		// Get the status records.  
		SQLSMALLINT i = 1;
		errors->clear();
		while ((rc2 = SQLGetDiagRec(HandleType, handle, i,  sql_state.data(), &native_error, msg.data(), msg.capacity(), &msg_len)) != SQL_NO_DATA) {
			if (rc2 < 0) {
				break;
			}
		
			auto c_msg = swcvec2str(msg, msg_len);
			auto c_state = swcvec2str(sql_state, sql_state.size());
			const auto m = string(c_msg);
			SQLGetDiagField(HandleType, handle, i, SQL_DIAG_SS_SEVERITY, &severity, SQL_IS_INTEGER, nullptr);
			SQLGetDiagField(HandleType, handle, i, SQL_DIAG_SS_SRVNAME, serverName.data(), serverName.capacity(), &serverName_len);
			const string c_serverName = swcvec2str(serverName, serverName_len);
			SQLGetDiagField(HandleType, handle, i, SQL_DIAG_SS_PROCNAME, procName.data(), procName.capacity(), &procName_len);
			const string c_procName = swcvec2str(procName, procName_len);
			SQLGetDiagField(HandleType, handle, i, SQL_DIAG_SS_LINE, &lineNumber, SQL_IS_UINTEGER, nullptr);
			if (received.find(m) == received.end()) {
				const auto last = make_shared<OdbcError>(c_state.c_str(), c_msg.c_str(), native_error, severity, c_serverName.c_str(), c_procName.c_str(), lineNumber);
				errors->push_back(last);
				received.insert(m);
			}
			i++;
		}
	}
}
