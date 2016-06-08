//---------------------------------------------------------------------------------------------------------------------------------
// File: OdbcStatementCache.h
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

#include "OdbcStatement.h"
#include <map>

namespace mssql
{
	using namespace std;

	class OdbcStatementCache
	{
	public:		
		OdbcStatementCache(OdbcConnectionHandle & connection) : connection(connection)
		{		
		}

		shared_ptr<OdbcStatement> checkout(int statementId)
		{
			shared_ptr<OdbcStatement> statement;
			auto itr = statements.find(statementId);
			if (itr != statements.end()) {
				statement = itr->second;
			}
			else {
				statement = make_shared<OdbcStatement>(connection);
				statements.insert(pair<size_t, shared_ptr<OdbcStatement>>(statementId, statement));
			}
						
			return statement;
		}

		void checkin(int statementId)
		{
			statements.erase(statementId);
		}
		
	private:
		typedef map<size_t, shared_ptr<OdbcStatement>> map_statements_t;
		map_statements_t statements;
		OdbcConnectionHandle & connection;
	};
}
