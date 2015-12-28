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

	   OdbcConnectionBridge()
	   {
		  connection = make_shared<OdbcConnection>();
	   }

	   Handle<Value> Close(Handle<Object> callback)
	   {
		  OperationManager::Add(make_shared<CloseOperation>(connection, callback));
		  nodeTypeFactory fact;
		  return fact.null();
	   }

	   void Collect(void)
	   {
		  OperationManager::Add(make_shared<CollectOperation>(connection));
	   }

	   Handle<Value> BeginTransaction(Handle<Object> callback)
	   {
		  OperationManager::Add(make_shared<BeginTranOperation>(connection, callback));
		  nodeTypeFactory fact;
		  return fact.null();
	   }

	   Handle<Value> Commit(Handle<Object> callback)
	   {
		  OperationManager::Add(make_shared<EndTranOperation>(connection, SQL_COMMIT, callback));
		  nodeTypeFactory fact;
		  return fact.null();
	   }

	   Handle<Value> Rollback(Handle<Object> callback)
	   {
		  OperationManager::Add(make_shared<EndTranOperation>(connection, SQL_ROLLBACK, callback));
		  nodeTypeFactory fact;
		  return fact.null();
	   }

	   Handle<Value> Query(Handle<Object> queryObject, Handle<Array> params, Handle<Object> callback)
	   {
		  auto queryString = get(queryObject, "query_str")->ToString();
		  auto timeout = get(queryObject, "query_timeout")->Int32Value();
		  auto operation = make_shared<QueryOperation>(connection, FromV8String(queryString), timeout, callback);
		  if (operation->BindParameters(params)) {
			 OperationManager::Add(operation);
		  }
		  nodeTypeFactory fact;
		  return fact.null();
	   }

	   Handle<Value> CallProcedure(Handle<Object> queryObject, Handle<Array> params, Handle<Object> callback)
	   {
		   auto queryString = get(queryObject, "query_str")->ToString();
		   auto timeout = get(queryObject, "query_timeout")->Int32Value();
		   auto operation = make_shared<ProcedureOperation>(connection, FromV8String(queryString), timeout, callback);
		   if (operation->BindParameters(params)) {
			   OperationManager::Add(operation);
		   }
		   nodeTypeFactory fact;
		   return fact.newInteger(operation->ID);
	   }

	   static Handle<Value> UnbindParameters(Handle<Value> val)
	   {
		  int id = val->Int32Value();
		  auto op = OperationManager::GetOperation(id);
		  auto po_ptr = static_cast<ProcedureOperation*>(op.get());
		  Local<Array> arr = po_ptr->UnbindParameters();
		  auto a2 = arr->Clone();
		  OperationManager::CheckinOperation(id);
		  return a2;
	   }

	   Handle<Value> ReadRow(Handle<Object> callback)
	   {
		  OperationManager::Add(make_shared<ReadRowOperation>(connection, callback));
		  nodeTypeFactory fact;
		  return fact.null();
	   }

	   Handle<Integer> ReadRowCount(void) const
	   {
		  assert(connection);
		  assert(connection->resultset);
		  nodeTypeFactory fact;
		  return fact.newInteger(static_cast<int32_t>(connection->resultset->RowCount()));
	   }

	   Handle<Value> ReadNextResult(Handle<Object> callback)
	   {
		  OperationManager::Add(make_shared<ReadNextResultOperation>(connection, callback));
		  nodeTypeFactory fact;
		  return fact.null();
	   }

	   Handle<Value> ReadColumn(Handle<Number> column, Handle<Object> callback)
	   {
		  OperationManager::Add(make_shared<ReadColumnOperation>(connection, column->Int32Value(), callback));
		  nodeTypeFactory fact;
		  return fact.null();
	   }

	   static Local<Value> get(Local<Object> o, const char *v)
	   {
		   nodeTypeFactory fact;
		   auto vp = fact.newString(v);
		   auto val = o->Get(vp);
		   return val;
	   }

	   Handle<Value> Open(Handle<Object> connectionObject, Handle<Object> callback, Handle<Object> backpointer)
	   {
		  auto connectionString = get(connectionObject, "conn_str")->ToString();
		  auto timeout = get(connectionObject, "conn_timeout")->Int32Value();

		  OperationManager::Add(make_shared<OpenOperation>(connection, FromV8String(connectionString), timeout, callback, backpointer));
		  nodeTypeFactory fact;
		  return fact.null();
	   }

    private:
	   shared_ptr<OdbcConnection> connection;
    };
}
