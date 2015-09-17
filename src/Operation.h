//---------------------------------------------------------------------------------------------------------------------------------
// File: Operation.h
// Contents: Queue calls to ODBC on background thread
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
#include <map>
#include <memory>
#include <stdafx.h>

namespace mssql {

    using namespace std;
 
    class Operation
    {
	   friend class OperationManager;

    public:
	   Operation() : persists(false), ID(-1)
	   {
	   }

	   virtual ~Operation();

	   virtual void InvokeBackground() = 0;
	   virtual void CompleteForeground() = 0;
	   bool persists;
	   int ID;

    private:
	   uv_work_t  work;
    };

    /* need to think about threading with multiple active connections */

    class OperationManager
    {
	   typedef map<size_t, shared_ptr<Operation>> map_perations_t;

    public:
	   static bool Add(shared_ptr<Operation> operation_ptr);
	   static void CheckinOperation(int id);
	   static shared_ptr<Operation> GetOperation(int id)
	   {
		  map_perations_t::const_iterator itr = operations.find(id);
		  return itr->second;
	   }

    private:
	   static map_perations_t operations;
	   static size_t _id;
	   static void OnBackground(uv_work_t* work);
	   static void OnForeground(uv_work_t* work);
    };
}
