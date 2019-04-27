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

	Handle<Value> OdbcConnectionBridge::close(Handle<Object> callback)
	{
		const auto op = make_shared<CloseOperation>(connection, callback);
		connection->send(op);
		//fprintf(stderr, "CloseOperation operationId=%llu\n", op->OperationID);
		nodeTypeFactory fact;
		return fact.null();
	}

	void OdbcConnectionBridge::collect()
	{
		const auto op = make_shared<CollectOperation>(connection);
		connection->send(op);
	}

	Handle<Value> OdbcConnectionBridge::begin_transaction(Handle<Object> callback)
	{
		const auto op = make_shared<BeginTranOperation>(connection, callback);
		connection->send(op);
		nodeTypeFactory fact;
		return fact.null();
	}

	Handle<Value> OdbcConnectionBridge::commit(Handle<Object> callback)
	{
		const auto op = make_shared<EndTranOperation>(connection, SQL_COMMIT, callback);
		connection->send(op);
		nodeTypeFactory fact;
		return fact.null();
	}

	Handle<Value> OdbcConnectionBridge::rollback(Handle<Object> callback)
	{
		const auto op = make_shared<EndTranOperation>(connection, SQL_ROLLBACK, callback);
		connection->send(op);
		nodeTypeFactory fact;
		return fact.null();
	}

	Handle<Value> OdbcConnectionBridge::query(Handle<Number> query_id, Handle<Object> query_object, Handle<Array> params, Handle<Object> callback) const
	{
		auto q = make_shared<QueryOperationParams>(query_id, query_object);
		const auto operation = make_shared<QueryOperation>(connection, q, callback);
		if (operation->bind_parameters(params)) {
			connection->send(operation);
		}
		nodeTypeFactory fact;
		return fact.null();
	}

	int32_t getint32(Handle<Number> l)
	{
		nodeTypeFactory fact;
		const auto context = fact.isolate->GetCurrentContext();
		if (!l->IsNull())
		{
			auto maybe = l->ToInt32(context);
			Local<Int32> local;
			if (maybe.ToLocal(&local))
			{
				return local->Value();
			}
		}
		return 0;
	}

	bool getbool(const Handle<Boolean> l)
	{
		nodeTypeFactory fact;
		const auto context = fact.isolate->GetCurrentContext();
		if (!l->IsNull())
		{
			auto maybe = l->ToBoolean(context);
			Local<Boolean> local;
			if (maybe.ToLocal(&local))
			{
				return local->Value();
			}
		}
		return false;
	}

	Local<String> getstring(const Local<Value> l)
	{
		nodeTypeFactory fact;
		const auto context = fact.isolate->GetCurrentContext();
		if (!l->IsNull())
		{
			auto maybe = l->ToString(context);
			Local<String> local;
			if (maybe.ToLocal(&local))
			{
				return local;
			}
		}
		const Local<String> s;
		return s;
	}

	Handle<Value> OdbcConnectionBridge::query_prepared(const Handle<Number> query_id, Handle<Array> params, Handle<Object> callback) const
	{
		auto id = getint32(query_id);
		const auto operation = make_shared<QueryPreparedOperation>(connection, id, 0, callback);
		if (operation->bind_parameters(params)) {
			connection->send(operation);
		}
		nodeTypeFactory fact;
		return fact.null();
	}

	Handle<Value> OdbcConnectionBridge::prepare(Handle<Number> query_id, Handle<Object> query_object, Handle<Object> callback) const
	{
		auto q = make_shared<QueryOperationParams>(query_id, query_object);
		const auto operation = make_shared<PrepareOperation>(connection, q, callback);
		connection->send(operation);
		nodeTypeFactory fact;
		return fact.null();
	}

	Handle<Value> OdbcConnectionBridge::call_procedure(Handle<Number> query_id, Handle<Object> query_object, Handle<Array> params, Handle<Object> callback) const
	{
		auto q = make_shared<QueryOperationParams>(query_id, query_object);

		const auto operation = make_shared<ProcedureOperation>(connection, q, callback);
		if (operation->bind_parameters(params)) {
			connection->send(operation);
		}
		nodeTypeFactory fact;
		return fact.new_int64(operation->OperationID);
	}

	Handle<Value> OdbcConnectionBridge::unbind_parameters(const Handle<Number> query_id, Handle<Object> callback)
	{
		auto id = getint32(query_id);
		const auto op = make_shared<UnbindOperation>(connection, id, callback);
		connection->send(op);
		nodeTypeFactory fact;
		return fact.null();
	}

	Handle<Value> OdbcConnectionBridge::cancel(const Handle<Number> query_id, Handle<Object> callback)
	{
		auto id = getint32(query_id);
		//fprintf(stderr, "cancel %lld", id);
		const auto op = make_shared<CancelOperation>(connection, id, callback);
		connection->send(op);
		nodeTypeFactory fact;
		return fact.null();
	}

	Handle<Value> OdbcConnectionBridge::polling_mode(const Handle<Number> query_id, const Handle<Boolean> mode, Handle<Object> callback)
	{
		auto id = getint32(query_id);
		auto polling = getbool(mode);

		const auto op = make_shared<PollingModeOperation>(connection, id, polling, callback);
		connection->send(op);
		nodeTypeFactory fact;
		return fact.null();
	}

	Handle<Value> OdbcConnectionBridge::free_statement(const Handle<Number> query_id, Handle<Object> callback)
	{
		auto id = static_cast<long>(getint32(query_id));
		nodeTypeFactory fact;
		auto op = make_shared<FreeStatementOperation>(connection, id, callback);
		connection->statements->checkin(id);
		op->mgr = connection->ops;
		connection->ops->add(op);

		return fact.null();
	}

	Handle<Value> OdbcConnectionBridge::read_next_result(const Handle<Number> query_id, Handle<Object> callback) const
	{
		auto id = getint32(query_id);
		const auto op = make_shared<ReadNextResultOperation>(connection, id, callback);
		connection->send(op);
		nodeTypeFactory fact;
		return fact.null();
	}

	Handle<Value> OdbcConnectionBridge::read_column(const Handle<Number> query_id, const Handle<Number> number_rows, Handle<Object> callback) const
	{
		auto id = getint32(query_id);
		const auto op = make_shared<ReadColumnOperation>(connection, id, getint32(number_rows), callback);
		connection->send(op);
		nodeTypeFactory fact;
		return fact.null();
	}

	Local<Value> OdbcConnectionBridge::get(Local<Object> o, const char* v)
	{
		nodeTypeFactory fact;
		const auto vp = fact.new_string(v);
		const auto val = o->Get(vp);
		return val;
	}

	Handle<Value> OdbcConnectionBridge::open(const Handle<Object> connection_object, Handle<Object> callback, Handle<Object> backpointer)
	{
		nodeTypeFactory fact;
		const auto context = fact.isolate->GetCurrentContext();
		const auto cs = get(connection_object, "conn_str");
		const auto connection_string = getstring(cs);
		const auto to = get(connection_object, "conn_timeout");
		auto maybe_to = to->ToInt32(context);
		Local<Int32> local;
		auto timeout = 0;
		if (maybe_to.ToLocal(&local)) {
			timeout = local->Value();
		}
		auto op = make_shared<OpenOperation>(connection, FromV8String(connection_string), timeout, callback, backpointer);
		op->mgr = connection->ops;
		connection->ops->add(op);

		return fact.null();
	}
}