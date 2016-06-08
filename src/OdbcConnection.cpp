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
#include "NodeColumns.h"

#pragma intrinsic( memset )

// convenient macro to set the error for the handle and return false
#define RETURN_ODBC_ERROR( handle )                         \
	           {                                                       \
        error = handle.LastError(); \
        handle.Free();                                      \
        return false;                                       \
	           }

// boilerplate macro for checking for ODBC errors in this file
#define CHECK_ODBC_ERROR( r, handle ) { if( !SQL_SUCCEEDED( r ) ) { RETURN_ODBC_ERROR( handle ); } }

// boilerplate macro for checking if SQL_NO_DATA was returned for field data
#define CHECK_ODBC_NO_DATA( r, handle ) {                                                                 \
    if( r == SQL_NO_DATA ) {                                                                              \
        error = make_shared<OdbcError>( OdbcError::NODE_SQL_NO_DATA.SqlState(), OdbcError::NODE_SQL_NO_DATA.Message(), \
            OdbcError::NODE_SQL_NO_DATA.Code() );                                                         \
        handle.Free();                                                                                    \
        return false;                                                                                     \
             } }

// to use with numeric_limits below
#undef max

namespace mssql
{
	OdbcEnvironmentHandle OdbcConnection::environment;

	bool OdbcConnection::InitializeEnvironment()
	{
		SQLRETURN ret = SQLSetEnvAttr(nullptr, SQL_ATTR_CONNECTION_POOLING, reinterpret_cast<SQLPOINTER>(SQL_CP_ONE_PER_HENV), 0);
		if (!SQL_SUCCEEDED(ret)) { return false; }

		if (!environment.Alloc()) { return false; }

		ret = SQLSetEnvAttr(environment, SQL_ATTR_ODBC_VERSION, reinterpret_cast<SQLPOINTER>(SQL_OV_ODBC3), 0);
		if (!SQL_SUCCEEDED(ret)) { return false; }
		ret = SQLSetEnvAttr(environment, SQL_ATTR_CP_MATCH, reinterpret_cast<SQLPOINTER>(SQL_CP_RELAXED_MATCH), 0);
		if (!SQL_SUCCEEDED(ret)) { return false; }

		return true;
	}

	bool OdbcConnection::TryClose()
	{
		if (connectionState != Closed)  // fast fail before critical section
		{
			ScopedCriticalSectionLock critSecLock(closeCriticalSection);
			if (connectionState != Closed)
			{
				SQLDisconnect(connection);
				connection.Free();
				connectionState = Closed;
			}
		}

		return true;
	}

	SQLRETURN OdbcConnection::openTimeout(int timeout)
	{
		SQLRETURN ret;
		if (timeout > 0)
		{
			SQLPOINTER to = reinterpret_cast<SQLPOINTER>(static_cast<UINT_PTR>(timeout));
			ret = SQLSetConnectAttr(connection, SQL_ATTR_CONNECTION_TIMEOUT, to, 0);
			CHECK_ODBC_ERROR(ret, connection);

			ret = SQLSetConnectAttr(connection, SQL_ATTR_LOGIN_TIMEOUT, to, 0);
			CHECK_ODBC_ERROR(ret, connection);
		}
		return true;
	}

	bool OdbcConnection::TryOpen(const wstring& connectionString, int timeout)
	{
		SQLRETURN ret;

		assert(connectionState == Closed);

		OdbcConnectionHandle localConnection;

		if (!localConnection.Alloc(environment)) { RETURN_ODBC_ERROR(environment); }
		this->connection = move(localConnection);
		statements = make_shared<OdbcStatementCache>(connection);

		ret = openTimeout(timeout);
		CHECK_ODBC_ERROR(ret, connection);
		SQLWCHAR * conn_str = const_cast<wchar_t *>(connectionString.c_str());
		SQLSMALLINT len = static_cast<SQLSMALLINT>(connectionString.length());
		ret = SQLDriverConnect(connection, nullptr, conn_str, len, nullptr, 0, nullptr, SQL_DRIVER_NOPROMPT);
		CHECK_ODBC_ERROR(ret, connection);

		connectionState = Open;
		return true;
	}

	bool OdbcConnection::TryBeginTran(void)
	{
		// turn off autocommit
		SQLPOINTER acoff = reinterpret_cast<SQLPOINTER>(SQL_AUTOCOMMIT_OFF);
		auto ret = SQLSetConnectAttr(connection, SQL_ATTR_AUTOCOMMIT, acoff, SQL_IS_UINTEGER);
		CHECK_ODBC_ERROR(ret, connection);

		return true;
	}

	bool OdbcConnection::TryEndTran(SQLSMALLINT completionType)
	{
		auto ret = SQLEndTran(SQL_HANDLE_DBC, connection, completionType);
		CHECK_ODBC_ERROR(ret, connection);
		SQLPOINTER acon = reinterpret_cast<SQLPOINTER>(SQL_AUTOCOMMIT_ON);
		// put the connection back into auto commit mode
		ret = SQLSetConnectAttr(connection, SQL_ATTR_AUTOCOMMIT, acon, SQL_IS_UINTEGER);
		CHECK_ODBC_ERROR(ret, connection);

		return true;
	}
}
