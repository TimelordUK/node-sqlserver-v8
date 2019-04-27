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

#include <stdafx.h>

namespace mssql
{
	using namespace std;
	using namespace v8;

	class OdbcConnection;

	class OdbcConnectionBridge
	{
	public:

		OdbcConnectionBridge();
		~OdbcConnectionBridge();
		Handle<Value> close(Handle<Object> callback);
		void collect(void);
		Handle<Value> begin_transaction(Handle<Object> callback);
		Handle<Value> commit(Handle<Object> callback);
		Handle<Value> rollback(Handle<Object> callback);
		Handle<Value> query(Handle<Number> query_id, Handle<Object> query_object, Handle<Array> params, Handle<Object> callback) const;
		Handle<Value> query_prepared(Handle<Number> query_id, Handle<Array> params, Handle<Object> callback) const;
		Handle<Value> prepare(Handle<Number> query_id, Handle<Object> query_object, Handle<Object> callback) const;
		Handle<Value> call_procedure(Handle<Number> query_id, Handle<Object> query_object, Handle<Array> params, Handle<Object> callback) const;
		Handle<Value> unbind_parameters(Handle<Number> query_id, Handle<Object> callback);
		Handle<Value> cancel(Handle<Number> query_id, Handle<Object> callback);
		Handle<Value> polling_mode(Handle<Number> query_id, Handle<Boolean> mode, Handle<Object> callback);
		Handle<Value> read_row(Handle<Number> query_id, Handle<Object> callback) const;
		Handle<Value> read_next_result(Handle<Number> query_id, Handle<Object> callback) const;
		Handle<Value> read_column(Handle<Number> query_id, Handle<Number> column, Handle<Object> callback) const;
		Handle<Value> open(Handle<Object> connection_object, Handle<Object> callback, Handle<Object> backpointer);
		Handle<Value> free_statement(Handle<Number> query_id, Handle<Object> callback);

	private:
		shared_ptr<OdbcConnection> connection;		
		static Local<Value> get(Local<Object> o, const char *v);
	};
}
