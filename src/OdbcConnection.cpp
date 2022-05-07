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
#include <OdbcConnection.h>
#include <OdbcStatementCache.h>
#include <OdbcOperation.h>
#include <ConnectionHandles.h>
#include <NodeColumns.h>
#include <sqltypes.h>

namespace mssql
{
	OdbcEnvironmentHandle OdbcConnection::environment;

#ifdef WINDOWS_BUILD
	bool OdbcConnection::InitializeEnvironment()
	{
		// fprintf(stderr, ">> InitializeEnvironment\n\n");

		auto ret = SQLSetEnvAttr(nullptr, SQL_ATTR_CONNECTION_POOLING,
		                         reinterpret_cast<SQLPOINTER>(SQL_CP_ONE_PER_HENV), 0);
		if (!SQL_SUCCEEDED(ret)) { return false; }

		if (!environment.alloc()) { return false; }

		ret = SQLSetEnvAttr(environment, SQL_ATTR_ODBC_VERSION, reinterpret_cast<SQLPOINTER>(SQL_OV_ODBC3), 0);
		if (!SQL_SUCCEEDED(ret)) { return false; }
		ret = SQLSetEnvAttr(environment, SQL_ATTR_CP_MATCH, reinterpret_cast<SQLPOINTER>(SQL_CP_RELAXED_MATCH), 0);
		if
		(!SQL_SUCCEEDED(ret)) { return false; }

		// fprintf(stderr, "<< InitializeEnvironment\n\n");

		return true;
	}
#endif
#ifdef LINUX_BUILD
	bool OdbcConnection::InitializeEnvironment()
	{
		if (!environment.alloc()) { return false; }
		auto ret = SQLSetEnvAttr(environment, SQL_ATTR_CONNECTION_POOLING, reinterpret_cast<SQLPOINTER>(SQL_CP_ONE_PER_HENV), 0);
		if (!SQL_SUCCEEDED(ret)) { return false; }
		ret = SQLSetEnvAttr(environment, SQL_ATTR_ODBC_VERSION, reinterpret_cast<SQLPOINTER>(SQL_OV_ODBC3), 0);
		if (!SQL_SUCCEEDED(ret)) { return false; }
		//ret = SQLSetEnvAttr(environment, SQL_ATTR_CP_MATCH, reinterpret_cast<SQLPOINTER>(SQL_CP_RELAXED_MATCH), 0);
		if (!SQL_SUCCEEDED(ret)) { 
			fprintf(stderr, " InitializeEnvironment fail %d\n", ret);
			return false; 
		}

		return true;
	}
#endif

	OdbcConnection::OdbcConnection() :
		_statements(nullptr),
		connectionState(Closed)
	{
		_errors = make_shared<vector<shared_ptr<OdbcError>>>();
		// ops = make_shared<OperationManager>();
	}

	OdbcConnection::~OdbcConnection()
	{
		//fprintf(stderr, "destruct OdbcConnection\n");
	}

	bool OdbcConnection::TryClose()
	{
		if (connectionState != Closed) // fast fail before critical section
		{
			ScopedCriticalSectionLock crit_sec_lock(closeCriticalSection);
			// std::cerr << " TryClose " << std::endl;
			//fprintf(stderr, "TryClose - %llu\n", statements->size());
			_statements->clear();
			_connectionHandles->clear();
			if (connectionState != Closed)
			{
				const auto ch = _connectionHandles->connectionHandle();
				const auto& connection = *ch;
				SQLDisconnect(connection);
				connectionState = Closed;
			}
		}

		return true;
	}

	bool OdbcConnection::ReturnOdbcError()
	{
		_errors->clear();
		const auto ch = _connectionHandles->connectionHandle();
		const auto& connection = *ch;
		connection.read_errors(_errors);
		// cerr << " RETURN_ODBC_ERROR " << endl;
		// fprintf(stderr, "RETURN_ODBC_ERROR - free connection handle\n\n");
		TryClose();
		return false;
	}

	bool OdbcConnection::CheckOdbcError(const SQLRETURN ret)
	{
		if (!SQL_SUCCEEDED(ret))
		{
			return ReturnOdbcError();
		}
		return true;
	}

	SQLRETURN OdbcConnection::open_timeout(const int timeout)
	{
		if (timeout > 0)
		{
			const auto ch = _connectionHandles->connectionHandle();
			const auto& connection = *ch;
			auto* const to = reinterpret_cast<SQLPOINTER>(static_cast<long long>(timeout));
			auto ret = SQLSetConnectAttr(connection, SQL_ATTR_CONNECTION_TIMEOUT, to, 0);
			if (!CheckOdbcError(ret)) return false;

			ret = SQLSetConnectAttr(connection, SQL_ATTR_LOGIN_TIMEOUT, to, 0);
			if (!CheckOdbcError(ret)) return false;
		}
		return true;
	}

	bool OdbcConnection::try_open(shared_ptr<vector<uint16_t>> connection_string, const int timeout)
	{
		assert(connectionState == Closed);
		_errors->clear();
		this->_connectionHandles = make_shared<ConnectionHandles>(environment);
		const auto connection = _connectionHandles->connectionHandle();
		if (connection == nullptr)
		{
			_errors->clear();
			environment.read_errors(_errors);
			//fprintf(stderr, "RETURN_ODBC_ERROR - free environment handle\n\n");
			environment.free();
			return false;
		}
		const auto &handle = *connection;
		_statements = make_shared<OdbcStatementCache>(_connectionHandles);
		auto ret = open_timeout(timeout);
		if (!CheckOdbcError(ret)) return false;
		ret = SQLSetConnectAttr(handle, SQL_COPT_SS_BCP, reinterpret_cast<SQLPOINTER>(SQL_BCP_ON), SQL_IS_INTEGER);  
		if (!CheckOdbcError(ret)) return false;

		ret = SQLDriverConnect(handle, nullptr, reinterpret_cast<SQLWCHAR*>(connection_string->data()),
		                       connection_string->size(), nullptr, 0, nullptr, SQL_DRIVER_NOPROMPT);
		if (!CheckOdbcError(ret)) return false;
		connectionState = Open;
		return true;
	}

	bool OdbcConnection::try_begin_tran()
	{
		// turn off autocommit
		const auto connection = _connectionHandles->connectionHandle();
		if (!connection) return false;
		auto* const acoff = reinterpret_cast<SQLPOINTER>(SQL_AUTOCOMMIT_OFF);
		const auto ret = SQLSetConnectAttr(*connection, SQL_ATTR_AUTOCOMMIT, acoff, SQL_IS_UINTEGER);
		return CheckOdbcError(ret);
	}

	void OdbcConnection::send(OdbcOperation* op) const
	{
		//fprintf(stderr, "OdbcConnection send\n");
		op->fetch_statement();
		Nan::AsyncQueueWorker(op);
	}

	bool OdbcConnection::try_end_tran(const SQLSMALLINT completion_type)
	{
		const auto connection = _connectionHandles->connectionHandle();
		if (!connection) return false;
		auto ret = SQLEndTran(SQL_HANDLE_DBC, *connection, completion_type);
		// cout << " try_end_tran " << "ret = " << ret << endl;
		if (!CheckOdbcError(ret)) return false;
		auto* const acon = reinterpret_cast<SQLPOINTER>(SQL_AUTOCOMMIT_ON);
		// put the connection back into auto commit mode
		ret = SQLSetConnectAttr(*connection, SQL_ATTR_AUTOCOMMIT, acon, SQL_IS_UINTEGER);
		return CheckOdbcError(ret);
	}
}
