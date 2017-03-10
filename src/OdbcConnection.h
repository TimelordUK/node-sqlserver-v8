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
#include "ResultSet.h"
#include "CriticalSection.h"
#include "OdbcOperation.h"

#include <map>

namespace mssql
{
	using namespace std;

	class OdbcStatementCache;

	class OdbcConnection
	{
	public:
		OdbcConnection();
		~OdbcConnection();
		static bool InitializeEnvironment();
		bool TryBeginTran();
		void send(shared_ptr<OdbcOperation> op) const;
		bool TryEndTran(SQLSMALLINT completionType);
		bool TryOpen(const wstring& connectionString, int timeout);
		shared_ptr<OdbcError> LastError(void) const { return error; }
		bool TryClose();
		shared_ptr<OdbcStatementCache> statements;
		shared_ptr<OperationManager> ops;

	private:
		bool ReturnOdbcError();
		bool CheckOdbcError(SQLRETURN ret);

		static OdbcEnvironmentHandle environment;
		SQLRETURN openTimeout(int timeout);
		
		shared_ptr<OdbcConnectionHandle> connection;
		CriticalSection closeCriticalSection;

		// any error that occurs when a Try* function returns false is stored here
		// and may be retrieved via the Error function below.

		shared_ptr<OdbcError> error;
	
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
