//---------------------------------------------------------------------------------------------------------------------------------
// File: OperationManager.h
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
#include <Operation.h>

namespace mssql {

	using namespace std;

	class OdbcStatement;

	/* need to think about threading with multiple active connections */

	class OperationManager
	{
		typedef map<size_t, shared_ptr<Operation>> map_operations_t;

	public:
		static bool Add(shared_ptr<Operation> operation_ptr);
		static void CheckinOperation(int id);
		static shared_ptr<Operation> GetOperation(int id);

	private:
		static map_operations_t operations;
		static size_t _id;
		static void OnBackground(uv_work_t* work);
		static void OnForeground(uv_work_t* work);
	};
}
