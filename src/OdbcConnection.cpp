//---------------------------------------------------------------------------------------------------------------------------------
// File: OdbcConnection.cpp
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

#include "stdafx.h"
#include "OdbcConnection.h"
#include "OdbcStatementCache.h"
#include "OperationManager.h"
#include "NodeColumns.h"

namespace mssql
{
	OdbcEnvironmentHandle OdbcConnection::environment;

	bool OdbcConnection::InitializeEnvironment()
	{
		// fprintf(stderr, ">> InitializeEnvironment\n\n");

		auto ret = SQLSetEnvAttr(nullptr, SQL_ATTR_CONNECTION_POOLING, reinterpret_cast<SQLPOINTER>(SQL_CP_ONE_PER_HENV), 0);
		if (!SQL_SUCCEEDED(ret)) { return false; }

		if (!environment.Alloc()) { return false; }

		ret = SQLSetEnvAttr(environment, SQL_ATTR_ODBC_VERSION, reinterpret_cast<SQLPOINTER>(SQL_OV_ODBC3), 0);
		if (!SQL_SUCCEEDED(ret)) { return false; }
		ret = SQLSetEnvAttr(environment, SQL_ATTR_CP_MATCH, reinterpret_cast<SQLPOINTER>(SQL_CP_RELAXED_MATCH), 0);
		if (!SQL_SUCCEEDED(ret)) { return false; }

		// fprintf(stderr, "<< InitializeEnvironment\n\n");

		return true;
	}

	OdbcConnection::OdbcConnection() :
		statements(nullptr),
		error(nullptr),
		connectionState(Closed)		
	{
		ops = make_shared<OperationManager>();
	}

	OdbcConnection::~OdbcConnection()
	{
		//fprintf(stderr, "destruct OdbcConnection\n");
	}

	bool OdbcConnection::TryClose()
	{
		if (connectionState != Closed)  // fast fail before critical section
		{			
			ScopedCriticalSectionLock critSecLock(closeCriticalSection);
			//fprintf(stderr, "TryClose - %llu\n", statements->size());
			statements->clear();
			if (connectionState != Closed)
			{
				SQLDisconnect(*connection);
				connectionState = Closed;
			}
		}

		return true;
	}

	bool OdbcConnection::ReturnOdbcError()
	{
		error = connection->ReadErrors();
		// fprintf(stderr, "RETURN_ODBC_ERROR - free connection handle\n\n");
		TryClose();
		return false;
	}

	bool OdbcConnection::CheckOdbcError(SQLRETURN ret)
	{
		if (!SQL_SUCCEEDED(ret))
		{
			return ReturnOdbcError();
		}
		return true;
	}

	SQLRETURN OdbcConnection::openTimeout(int timeout)
	{
		if (timeout > 0)
		{
			auto to = reinterpret_cast<SQLPOINTER>(static_cast<UINT_PTR>(timeout));
			auto ret = SQLSetConnectAttr(*connection, SQL_ATTR_CONNECTION_TIMEOUT, to, 0);
			if (!CheckOdbcError(ret)) return false;

			ret = SQLSetConnectAttr(*connection, SQL_ATTR_LOGIN_TIMEOUT, to, 0);
			if (!CheckOdbcError(ret)) return false;
		}
		return true;
	}

	bool OdbcConnection::TryOpen(const wstring& connectionString, int timeout)
	{
		assert(connectionState == Closed);

		this->connection = make_shared<OdbcConnectionHandle>();
	
		if (!connection->Alloc(environment)) {
			error = environment.ReadErrors();
			//fprintf(stderr, "RETURN_ODBC_ERROR - free environment handle\n\n");
			environment.Free();
			return false;
		}
	
		statements = make_shared<OdbcStatementCache>(connection);

		auto ret = openTimeout(timeout);
		if (!CheckOdbcError(ret)) return false;
		auto * conn_str = const_cast<wchar_t *>(connectionString.c_str());
		auto len = static_cast<SQLSMALLINT>(connectionString.length());
		ret = SQLDriverConnect(*connection, nullptr, conn_str, len, nullptr, 0, nullptr, SQL_DRIVER_NOPROMPT);
		if (!CheckOdbcError(ret)) return false;

		connectionState = Open;
		return true;
	}

	bool OdbcConnection::TryBeginTran(void)
	{
		// turn off autocommit
		auto acoff = reinterpret_cast<SQLPOINTER>(SQL_AUTOCOMMIT_OFF);
		auto ret = SQLSetConnectAttr(*connection, SQL_ATTR_AUTOCOMMIT, acoff, SQL_IS_UINTEGER);
		if (!CheckOdbcError(ret)) return false;

		return true;
	}
	
	void OdbcConnection::send(shared_ptr<OdbcOperation> op) const
	{
		//fprintf(stderr, "OdbcConnection send\n");
		op->fetchStatement();
		//fprintf(stderr, "OdbcConnection fetched\n");
		//fprintf(stderr, "OdbcConnection statement %p\n", op->statement.get());
		op->mgr = ops;
		ops->Add(op);
	}

	bool OdbcConnection::TryEndTran(SQLSMALLINT completionType)
	{
		auto ret = SQLEndTran(SQL_HANDLE_DBC, *connection, completionType);
		if (!CheckOdbcError(ret)) return false;
		auto acon = reinterpret_cast<SQLPOINTER>(SQL_AUTOCOMMIT_ON);
		// put the connection back into auto commit mode
		ret = SQLSetConnectAttr(*connection, SQL_ATTR_AUTOCOMMIT, acon, SQL_IS_UINTEGER);
		if (!CheckOdbcError(ret)) return false;

		return true;
	}
}
