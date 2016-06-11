//---------------------------------------------------------------------------------------------------------------------------------
// File: OdbcStatementCache.cpp
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

#include "OdbcStatementCache.h"
#include "OdbcStatement.h"

namespace mssql
{
	using namespace std;

	OdbcStatementCache::OdbcStatementCache(OdbcConnectionHandle & connection) 
		: 
		connection(connection)
	{
	}

	shared_ptr<OdbcStatement> OdbcStatementCache::find(int statementId)
	{
		shared_ptr<OdbcStatement> statement = nullptr;
		auto itr = statements.find(statementId);
		if (itr != statements.end()) {
			statement = itr->second;
		}
		return statement;
	}

	shared_ptr<OdbcStatement> OdbcStatementCache::store(shared_ptr<OdbcStatement> statement)
	{
		statements.insert(pair<size_t, shared_ptr<OdbcStatement>>(statement->getStatementId(), statement));
		return statement;
	}

	shared_ptr<OdbcStatement> OdbcStatementCache::checkout(int statementId)
	{
		auto statement = find(statementId);
		if (statement != nullptr) return statement;
		return store(make_shared<OdbcStatement>(statementId, connection));
	}

	void OdbcStatementCache::checkin(int statementId)
	{
		statements.erase(statementId);
	}
}
