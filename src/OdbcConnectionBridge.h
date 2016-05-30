//---------------------------------------------------------------------------------------------------------------------------------
// File: OdbcConnectionBridge.h
// Contents: Create (bridge) operations to be completed on background thread queue
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

#include "Operation.h"
#include "OdbcConnection.h"
#include "OdbcOperation.h"

namespace mssql
{
	using namespace std;
	using namespace v8;

	class OdbcConnectionBridge
	{
	public:

		OdbcConnectionBridge();
		Handle<Value> Close(Handle<Object> callback);
		void Collect(void);
		Handle<Value> BeginTransaction(Handle<Object> callback);
		Handle<Value> Commit(Handle<Object> callback);
		Handle<Value> Rollback(Handle<Object> callback);
		Handle<Value> Query(Handle<Object> queryObject, Handle<Array> params, Handle<Object> callback);
		Handle<Value> Prepare(Handle<Object> queryObject, Handle<Object> callback);
		Handle<Value> CallProcedure(Handle<Object> queryObject, Handle<Array> params, Handle<Object> callback);
		static Handle<Value> UnbindParameters(Handle<Value> val);
		Handle<Value> ReadRow(Handle<Object> callback);
		Handle<Integer> ReadRowCount(void) const;
		Handle<Value> ReadNextResult(Handle<Object> callback);
		Handle<Value> ReadColumn(Handle<Number> column, Handle<Object> callback);
		static Local<Value> get(Local<Object> o, const char *v);
		Handle<Value> Open(Handle<Object> connectionObject, Handle<Object> callback, Handle<Object> backpointer);

	private:
		shared_ptr<OdbcConnection> connection;
	};
}
