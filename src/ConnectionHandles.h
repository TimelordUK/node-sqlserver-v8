//---------------------------------------------------------------------------------------------------------------------------------
// File: ConnectionHandles.h
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

#pragma once

#include "stdafx.h"
#include <vector>
#include <map>

namespace mssql
{
    using namespace std;
    class OdbcConnectionHandle;
    class OdbcStatementHandle;
    class OdbcEnvironmentHandle;

    class ConnectionHandles
    {
    public:
		 ConnectionHandles(const OdbcEnvironmentHandle &env);
         ~ConnectionHandles();
         shared_ptr<OdbcStatementHandle> checkout(long statementId);
         void checkin(long statementId);
         inline shared_ptr<OdbcConnectionHandle> connectionHandle() { return _connectionHandle; }
         void clear();

    private:
      
        shared_ptr<OdbcStatementHandle> store(shared_ptr<OdbcStatementHandle> handle);
        shared_ptr<OdbcStatementHandle> find(const long statement_id); 
        map<long, shared_ptr<OdbcStatementHandle>> _statementHandles;
        shared_ptr<OdbcConnectionHandle> _connectionHandle;
    };
}
