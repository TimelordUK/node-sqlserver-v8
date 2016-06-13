//---------------------------------------------------------------------------------------------------------------------------------
// File: OdbcConnectionBridge.cpp
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

#include "OdbcConnectionBridge.h"
#include "QueryOperation.h"
#include "EndTranOperation.h"
#include "CollectOperation.h"
#include "BeginTranOperation.h"
#include "ProcedureOperation.h"
#include "ReadRowOperation.h"
#include "OpenOperation.h"
#include "ReadNextResultOperation.h"
#include "ReadColumnOperation.h"
#include "CloseOperation.h"
#include "PrepareOperation.h"
#include "FreeStatementOperation.h"
#include "OperationManager.h"

namespace mssql
{
	using namespace std;
	using namespace v8;

	OdbcConnectionBridge::OdbcConnectionBridge()
	{
		connection = make_shared<OdbcConnection>();
	}

	OdbcConnectionBridge::~OdbcConnectionBridge()
	{
		//fprintf(stderr, "destruct OdbcConnectionBridge\n");
	}

	Handle<Value> OdbcConnectionBridge::Close(Handle<Object> callback)
	{
		auto op = make_shared<CloseOperation>(connection, callback);
		OperationManager::Add(op);
		//fprintf(stderr, "CloseOperation operationId=%llu\n", op->OperationID);
		nodeTypeFactory fact;
		return fact.null();
	}

	void OdbcConnectionBridge::Collect(void)
	{
		OperationManager::Add(make_shared<CollectOperation>(connection));
	}

	Handle<Value> OdbcConnectionBridge::BeginTransaction(Handle<Object> callback)
	{
		OperationManager::Add(make_shared<BeginTranOperation>(connection, callback));
		nodeTypeFactory fact;
		return fact.null();
	}

	Handle<Value> OdbcConnectionBridge::Commit(Handle<Object> callback)
	{
		OperationManager::Add(make_shared<EndTranOperation>(connection, SQL_COMMIT, callback));
		nodeTypeFactory fact;
		return fact.null();
	}

	Handle<Value> OdbcConnectionBridge::Rollback(Handle<Object> callback)
	{
		OperationManager::Add(make_shared<EndTranOperation>(connection, SQL_ROLLBACK, callback));
		nodeTypeFactory fact;
		return fact.null();
	}

	Handle<Value> OdbcConnectionBridge::Query(Handle<Number> queryId, Handle<Object> queryObject, Handle<Array> params, Handle<Object> callback) const
	{
		auto queryString = get(queryObject, "query_str")->ToString();
		auto timeout = get(queryObject, "query_timeout")->Int32Value();
		auto id = queryId->IntegerValue();
		auto operation = make_shared<QueryOperation>(connection, FromV8String(queryString), id, timeout, callback);
		if (operation->BindParameters(params)) {
			OperationManager::Add(operation);
		}
		nodeTypeFactory fact;
		return fact.null();
	}

	Handle<Value> OdbcConnectionBridge::Prepare(Handle<Number> queryId, Handle<Object> queryObject, Handle<Array> params, Handle<Object> callback) const
	{
		auto queryString = get(queryObject, "query_str")->ToString();
		auto timeout = get(queryObject, "query_timeout")->Int32Value();
		auto id = queryId->IntegerValue();
		auto operation = make_shared<PrepareOperation>(connection, FromV8String(queryString), id, timeout, callback);
		if (operation->BindParameters(params)) {
			OperationManager::Add(operation);
		}
		nodeTypeFactory fact;
		return fact.null();
	}

	Handle<Value> OdbcConnectionBridge::CallProcedure(Handle<Number> queryId, Handle<Object> queryObject, Handle<Array> params, Handle<Object> callback) const
	{
		auto queryString = get(queryObject, "query_str")->ToString();
		auto timeout = get(queryObject, "query_timeout")->Int32Value();
		auto id = queryId->IntegerValue();
		
		auto operation = make_shared<ProcedureOperation>(connection, FromV8String(queryString), id, timeout, callback);
		if (operation->BindParameters(params)) {
			OperationManager::Add(operation);
		}
		nodeTypeFactory fact;
		return fact.newInt64(operation->OperationID);
	}

	Handle<Value> OdbcConnectionBridge::UnbindParameters(Handle<Number> queryId, Handle<Value> val)
	{
		int id = val->Int32Value();
		auto op = OperationManager::GetOperation(id);
		auto po_ptr = static_cast<ProcedureOperation*>(op.get());
		Local<Array> arr = po_ptr->UnbindParameters();
		auto a2 = arr->Clone();
		OperationManager::CheckinOperation(id);
		return a2;
	}

	Handle<Value> OdbcConnectionBridge::FreeStatement(Handle<Number> queryId, Handle<Object> callback)
	{
		int id = queryId->IntegerValue();
		nodeTypeFactory fact;
		OperationManager::Add(make_shared<FreeStatementOperation>(connection, id, callback));
		
		return fact.null();
	}

	Handle<Value> OdbcConnectionBridge::ReadRow(Handle<Number> queryId, Handle<Object> callback) const
	{
		auto id = queryId->IntegerValue();
		OperationManager::Add(make_shared<ReadRowOperation>(connection, id, callback));
		nodeTypeFactory fact;
		return fact.null();
	}

	Handle<Value> OdbcConnectionBridge::ReadNextResult(Handle<Number> queryId, Handle<Object> callback) const
	{
		auto id = queryId->IntegerValue();
		OperationManager::Add(make_shared<ReadNextResultOperation>(connection, id, callback));
		nodeTypeFactory fact;
		return fact.null();
	}

	Handle<Value> OdbcConnectionBridge::ReadColumn(Handle<Number> queryId, Handle<Number> column, Handle<Object> callback) const
	{
		auto id = queryId->IntegerValue();
		OperationManager::Add(make_shared<ReadColumnOperation>(connection, id, column->Int32Value(), callback));
		nodeTypeFactory fact;
		return fact.null();
	}

	Local<Value> OdbcConnectionBridge::get(Local<Object> o, const char *v)
	{
		nodeTypeFactory fact;
		auto vp = fact.newString(v);
		auto val = o->Get(vp);
		return val;
	}

	Handle<Value> OdbcConnectionBridge::Open(Handle<Object> connectionObject, Handle<Object> callback, Handle<Object> backpointer)
	{
		auto connectionString = get(connectionObject, "conn_str")->ToString();
		auto timeout = get(connectionObject, "conn_timeout")->Int32Value();

		OperationManager::Add(make_shared<OpenOperation>(connection, FromV8String(connectionString), timeout, callback, backpointer));
		nodeTypeFactory fact;
		return fact.null();
	}
}
