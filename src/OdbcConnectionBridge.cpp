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

#include <OdbcConnectionBridge.h>
#include <QueryOperation.h>
#include <QueryOperationParams.h>
#include <EndTranOperation.h>
#include <CollectOperation.h>
#include <BeginTranOperation.h>
#include <ProcedureOperation.h>
#include <ReadRowOperation.h>
#include <OpenOperation.h>
#include <ReadNextResultOperation.h>
#include <ReadColumnOperation.h>
#include <CloseOperation.h>
#include <CancelOperation.h>
#include <PrepareOperation.h>
#include <FreeStatementOperation.h>
#include <QueryPreparedOperation.h>
#include <OperationManager.h>
#include <UnbindOperation.h>
#include <OdbcStatementCache.h>
#include <PollingModeOperation.h>

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
		// fprintf(stderr, "destruct OdbcConnectionBridge\n");
	}

	Handle<Value> OdbcConnectionBridge::Close(Handle<Object> callback)
	{
		const auto op = make_shared<CloseOperation>(connection, callback);
		connection->send(op);
		//fprintf(stderr, "CloseOperation operationId=%llu\n", op->OperationID);
		nodeTypeFactory fact;
		return fact.null();
	}

	void OdbcConnectionBridge::Collect()
	{
		const auto op = make_shared<CollectOperation>(connection);
		connection->send(op);
	}

	Handle<Value> OdbcConnectionBridge::BeginTransaction(Handle<Object> callback)
	{
		const auto op = make_shared<BeginTranOperation>(connection, callback);
		connection->send(op);
		nodeTypeFactory fact;
		return fact.null();
	}

	Handle<Value> OdbcConnectionBridge::Commit(Handle<Object> callback)
	{
		const auto op = make_shared<EndTranOperation>(connection, SQL_COMMIT, callback);
		connection->send(op);
		nodeTypeFactory fact;
		return fact.null();
	}

	Handle<Value> OdbcConnectionBridge::Rollback(Handle<Object> callback)
	{
		const auto op = make_shared<EndTranOperation>(connection, SQL_ROLLBACK, callback);
		connection->send(op);
		nodeTypeFactory fact;
		return fact.null();
	}

	Handle<Value> OdbcConnectionBridge::Query(Handle<Number> query_id, Handle<Object> query_object, Handle<Array> params, Handle<Object> callback) const
	{
		auto q = make_shared<QueryOperationParams>(query_id, query_object);
		const auto operation = make_shared<QueryOperation>(connection, q, callback);
		if (operation->BindParameters(params)) {
			connection->send(operation);
		}
		nodeTypeFactory fact;
		return fact.null();
	}

	Handle<Value> OdbcConnectionBridge::QueryPrepared(Handle<Number> query_id, Handle<Array> params, Handle<Object> callback) const
	{
		auto id = query_id->IntegerValue();
		const auto operation = make_shared<QueryPreparedOperation>(connection, id, 0, callback);
		if (operation->BindParameters(params)) {
			connection->send(operation);
		}
		nodeTypeFactory fact;
		return fact.null();
	}

	Handle<Value> OdbcConnectionBridge::Prepare(Handle<Number> query_id, Handle<Object> query_object, Handle<Object> callback) const
	{
		auto q = make_shared<QueryOperationParams>(query_id, query_object);
		const auto operation = make_shared<PrepareOperation>(connection, q, callback);
		connection->send(operation);
		nodeTypeFactory fact;
		return fact.null();
	}

	Handle<Value> OdbcConnectionBridge::CallProcedure(Handle<Number> query_id, Handle<Object> query_object, Handle<Array> params, Handle<Object> callback) const
	{
		auto q = make_shared<QueryOperationParams>(query_id, query_object);

		const auto operation = make_shared<ProcedureOperation>(connection, q, callback);
		if (operation->BindParameters(params)) {
			connection->send(operation);
		}
		nodeTypeFactory fact;
		return fact.newInt64(operation->OperationID);
	}

	Handle<Value> OdbcConnectionBridge::UnbindParameters(Handle<Number> query_id, Handle<Object> callback)
	{
		auto id = query_id->IntegerValue();
		const auto op = make_shared<UnbindOperation>(connection, id, callback);
		connection->send(op);
		nodeTypeFactory fact;
		return fact.null();
	}

	Handle<Value> OdbcConnectionBridge::Cancel(Handle<Number> query_id, Handle<Object> callback)
	{
		auto id = query_id->IntegerValue();
		//fprintf(stderr, "cancel %lld", id);
		const auto op = make_shared<CancelOperation>(connection, id, callback);
		connection->send(op);
		nodeTypeFactory fact;
		return fact.null();
	}

	Handle<Value> OdbcConnectionBridge::PollingMode(Handle<Number> query_id, Handle<Boolean> mode, Handle<Object> callback)
	{
		auto id = query_id->IntegerValue();
		auto polling = mode->BooleanValue();

		const auto op = make_shared<PollingModeOperation>(connection, id, polling, callback);
		connection->send(op);
		nodeTypeFactory fact;
		return fact.null();
	}

	Handle<Value> OdbcConnectionBridge::FreeStatement(Handle<Number> query_id, Handle<Object> callback)
	{
		auto id = static_cast<long>(query_id->IntegerValue());
		nodeTypeFactory fact;
		auto op = make_shared<FreeStatementOperation>(connection, id, callback);
		connection->statements->checkin(id);	
		op->mgr = connection->ops;
		connection->ops->add(op);

		return fact.null();
	}

	Handle<Value> OdbcConnectionBridge::ReadRow(Handle<Number> query_id, Handle<Object> callback) const
	{
		auto id = query_id->IntegerValue();
		const auto op = make_shared<ReadRowOperation>(connection, id, callback);
		connection->send(op);
		nodeTypeFactory fact;
		return fact.null();
	}

	Handle<Value> OdbcConnectionBridge::ReadNextResult(Handle<Number> query_id, Handle<Object> callback) const
	{
		auto id = query_id->IntegerValue();
		const auto op = make_shared<ReadNextResultOperation>(connection, id, callback);
		connection->send(op);
		nodeTypeFactory fact;
		return fact.null();
	}

	Handle<Value> OdbcConnectionBridge::ReadColumn(Handle<Number> query_id, Handle<Number> column, Handle<Object> callback) const
	{
		auto id = query_id->IntegerValue();
		const auto op = make_shared<ReadColumnOperation>(connection, id, column->Int32Value(), callback);
		connection->send(op);
		nodeTypeFactory fact;
		return fact.null();
	}

	Local<Value> OdbcConnectionBridge::get(Local<Object> o, const char *v)
	{
		nodeTypeFactory fact;
		const auto vp = fact.newString(v);
		const auto val = o->Get(vp);
		return val;
	}

	Handle<Value> OdbcConnectionBridge::Open(Handle<Object> connection_object, Handle<Object> callback, Handle<Object> backpointer)
	{
		const auto connection_string = get(connection_object, "conn_str")->ToString();
		auto timeout = get(connection_object, "conn_timeout")->Int32Value();
		auto op = make_shared<OpenOperation>(connection, FromV8String(connection_string), timeout, callback, backpointer);
		op->mgr = connection->ops;
		connection->ops->add(op);
		nodeTypeFactory fact;
		return fact.null();
	}
}
