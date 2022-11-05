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

#include <OdbcStatementCache.h>
#include <OdbcStatement.h>
#include <ConnectionHandles.h>
// #include <iostream>

namespace mssql
{
	using namespace std;

	OdbcStatementCache::OdbcStatementCache(const shared_ptr<ConnectionHandles>  connectionHandles) 
		: 
		_connectionHandles(connectionHandles)
	{
	}

	OdbcStatementCache::~OdbcStatementCache()
	{
	}

	void OdbcStatementCache::clear()
	{
		// cerr << "OdbcStatementCache - size = " << statements.size() << endl;
		vector<long> ids;
		// fprintf(stderr, "destruct OdbcStatementCache\n");

		for_each(statements.begin(), statements.end(), [&](const auto & p) {
			ids.insert(ids.begin(), p.first);
		});

		for_each(ids.begin(), ids.end(), [&](const long id) {
			// cerr << "destruct OdbcStatementCache - erase statement" << id << endl;
			statements.erase(id);
		});
		_spent_statements.clear();
	}

	shared_ptr<OdbcStatement> OdbcStatementCache::find(const long statement_id)
	{
		shared_ptr<OdbcStatement> statement = nullptr;
		const auto itr = statements.find(statement_id);
		if (itr != statements.end()) {
			statement = itr->second;
		}
		return statement;
	}

	shared_ptr<OdbcStatement> OdbcStatementCache::store(shared_ptr<OdbcStatement> statement)
	{
		statements.insert(pair<long, shared_ptr<OdbcStatement>>(statement->get_statement_id(), statement));
		return statement;
	}

	shared_ptr<OdbcStatement> OdbcStatementCache::checkout(long statement_id)
	{
		if (statement_id < 0)
		{
			//fprintf(stderr, "dont fetch id %ld\n", statementId);
			return nullptr;
		}
		if (_spent_statements.find(statement_id) != _spent_statements.end()) {
			return nullptr;
		}
		if (auto statement = find(statement_id)) return statement;
		return store(make_shared<OdbcStatement>(statement_id, _connectionHandles));
	}

	void OdbcStatementCache::checkin(const long statement_id)
	{
		if (statement_id < 0) return;
		const auto statement = find(statement_id);
		if (statement != nullptr) {
			statement->done();
		    // cerr << "checkin  " << statement_id << endl;
			_connectionHandles->checkin(statement_id);
			_spent_statements.emplace(statement_id);
			statements.erase(statement_id);
		}
	}
}
