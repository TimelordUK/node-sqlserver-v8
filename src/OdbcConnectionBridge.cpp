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
#include <MutateJS.h>
#include <iostream>

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

	Local<Value> OdbcConnectionBridge::close(const Local<Object> callback) const
	{
		auto* const op = new CloseOperation(connection, callback);
		connection->send(op);
		//fprintf(stderr, "CloseOperation operationId=%llu\n", op->OperationID);
		return Nan::Null();
	}

	void OdbcConnectionBridge::collect() const 
	{
		auto* const op = new CollectOperation(connection);
		connection->send(op);
	}

	Local<Value> OdbcConnectionBridge::begin_transaction(const Local<Object> callback) const 
	{
		auto* const op = new BeginTranOperation(connection, callback);
		connection->send(op);
		return Nan::Null();
	}

	Local<Value> OdbcConnectionBridge::commit(const Local<Object> callback) const
	{
		auto* const op = new EndTranOperation(connection, SQL_COMMIT, callback);
		connection->send(op);
		return Nan::Null();
	}

	Local<Value> OdbcConnectionBridge::rollback(const Local<Object> callback) const
	{
		auto* const op = new EndTranOperation(connection, SQL_ROLLBACK, callback);
		connection->send(op);
		return Nan::Null();
	}

	Local<Value> OdbcConnectionBridge::query(Local<Number> query_id, Local<Object> query_object, Local<Array> params, const Local<Object> callback) const
	{
		const auto q = make_shared<QueryOperationParams>(query_id, query_object);
		auto* operation = new QueryOperation(connection, q, callback);
		if (operation->bind_parameters(params)) {
			connection->send(operation);
		} else {
			delete operation;
		}
		return Nan::Null();
	}

	int32_t getint32(const Local<Number> l)
	{
		const nodeTypeFactory fact;
		const auto context = fact.isolate->GetCurrentContext();
		if (!l->IsNull())
		{
			const auto maybe = l->ToInt32(context);
			Local<Int32> local;
			if (maybe.ToLocal(&local))
			{
				return local->Value();
			}
		}
		return 0;
	}

	Local<String> getstring(const Local<Value> l)
	{
		const nodeTypeFactory fact;
		const auto context = fact.isolate->GetCurrentContext();
		if (!l->IsNull())
		{
			const auto maybe = l->ToString(context);
			Local<String> local;
			if (maybe.ToLocal(&local))
			{
				return local;
			}
		}
		const Local<String> s;
		return s;
	}

	Local<Value> OdbcConnectionBridge::query_prepared(const Local<Number> query_id, Local<Array> params, const Local<Object> callback) const
	{
		const auto id = getint32(query_id);
		auto *operation = new QueryPreparedOperation(connection, id, 0, callback);
		if (operation->bind_parameters(params)) {
			connection->send(operation);
		} else {
			delete operation;
		}
		return Nan::Null();
	}

	Local<Value> OdbcConnectionBridge::prepare(Local<Number> query_id, Local<Object> query_object, const Local<Object> callback) const
	{
		const auto q = make_shared<QueryOperationParams>(query_id, query_object);
		auto* const operation = new PrepareOperation(connection, q, callback);
		connection->send(operation);
		return Nan::Null();
	}

	Local<Value> OdbcConnectionBridge::call_procedure(Local<Number> query_id, Local<Object> query_object, Local<Array> params, const Local<Object> callback) const
	{
		const auto q = make_shared<QueryOperationParams>(query_id, query_object);

		auto *operation = new ProcedureOperation(connection, q, callback);
		if (operation->bind_parameters(params)) {
			connection->send(operation);
		} else {
			delete operation;
		}
		return Nan::Null();
	}

	Local<Value> OdbcConnectionBridge::unbind_parameters(const Local<Number> query_id, const Local<Object> callback) const 
	{
		const auto id = getint32(query_id);
		auto* const op = new UnbindOperation(connection, id, callback);
		connection->send(op);
		return Nan::Null();
	}

	Local<Value> OdbcConnectionBridge::cancel(const Local<Number> query_id, const Local<Object> callback) const
	{
		const auto id = getint32(query_id);
		//fprintf(stderr, "cancel %lld", id);
		auto* const op = new CancelOperation(connection, id, callback);
		connection->send(op);
		return Nan::Null();
	}

	Local<Value> OdbcConnectionBridge::polling_mode(const Local<Number> query_id, const Local<Boolean> mode, const Local<Object> callback) const
	{
		const auto id = getint32(query_id);
		const auto polling = MutateJS::as_boolean(mode);
		auto* const op = new PollingModeOperation(connection, id, polling, callback);
		connection->send(op);
		return Nan::Null();
	}

	Local<Value> OdbcConnectionBridge::free_statement(const Local<Number> query_id, const Local<Object> callback) const
	{
		const auto id = static_cast<long>(getint32(query_id));
		auto* op = new FreeStatementOperation(connection, id, callback);
		connection->send(op);
		return Nan::Null();
	}

	Local<Value> OdbcConnectionBridge::read_next_result(const Local<Number> query_id, const Local<Object> callback) const
	{
		const auto id = getint32(query_id);
		auto* const op = new ReadNextResultOperation(connection, id, callback);
		connection->send(op);
		return Nan::Null();
	}

	Local<Value> OdbcConnectionBridge::read_column(const Local<Number> query_id, const Local<Number> number_rows, Local<Object> callback) const
	{
		const auto id = getint32(query_id);
		auto* const op = new ReadColumnOperation(connection, id, getint32(number_rows), callback);
		connection->send(op);
		return Nan::Null();
	}

	Local<Value> OdbcConnectionBridge::open(const Local<Object> connection_object, const Local<Object> callback, const Local<Object> backpointer) const
	{
		nodeTypeFactory fact;
		const auto context = Nan::GetCurrentContext();
		const auto cs = MutateJS::get_property_as_value(connection_object, "conn_str");
		const auto connection_string = getstring(cs);
		const auto to = MutateJS::get_property_as_value(connection_object, "conn_timeout");
		const auto maybe_to = to->ToInt32(context);
		Local<Int32> local;
		auto timeout = 0;
		if (maybe_to.ToLocal(&local)) {
			timeout = local->Value();
		}

		auto* const op = new OpenOperation(connection, connection_string, timeout, callback, backpointer);
		connection->send(op);
		return Nan::Null();
	}
}