//---------------------------------------------------------------------------------------------------------------------------------
// File: OdbcConnection.h
// Contents: Async calls to ODBC done in background thread
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

#include "stdafx.h"
#include <CriticalSection.h>
#include <map>

namespace mssql
{
	using namespace std;

	class OdbcStatementCache;
	class ResultSet;
	class OdbcOperation;
	class OperationManager;
	class ConnectionHandles;

	class OdbcConnection
	{
	public:
		OdbcConnection();
		~OdbcConnection();
		static bool InitializeEnvironment();
		bool try_begin_tran();
		bool send(OdbcOperation* op) const;
		bool try_end_tran(SQLSMALLINT completion_type);
		bool try_open(shared_ptr<vector<uint16_t>> connection_string, int timeout);
		shared_ptr<vector<shared_ptr<OdbcError>>> errors(void) const { return _errors; }
		bool TryClose();
		shared_ptr<OdbcStatementCache> getStatamentCache() { return _statements; }
		
	private:
		shared_ptr<OdbcStatementCache> _statements;
		bool ReturnOdbcError();
		bool CheckOdbcError(SQLRETURN ret);
		
		static OdbcEnvironmentHandle environment;
		SQLRETURN open_timeout(int timeout);		
		shared_ptr<ConnectionHandles> _connectionHandles;
		std::mutex closeCriticalSection;

		// any error that occurs when a Try* function returns false is stored here
		// and may be retrieved via the Error function below.

		shared_ptr<vector<shared_ptr<OdbcError>>> _errors;
	
		enum ConnectionStates
		{
			Closed,
			Opening,
			TurnOffAutoCommit,
			Open
		} connectionState;

		// set binary true if a binary Buffer should be returned instead of a JS string
	};
}
