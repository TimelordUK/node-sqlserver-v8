//---------------------------------------------------------------------------------------------------------------------------------
// File: Connection.cpp
// Contents: C++ interface to Microsoft Driver for Node.js for SQL Server
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

#include "stdafx.h"
#include <Connection.h>
#include <OdbcConnection.h>
#include <MutateJS.h>

namespace mssql
{
	using namespace v8;

	Nan::Persistent<v8::Function> Connection::constructor;

	Connection::Connection()
		: connectionBridge(make_unique<OdbcConnectionBridge>())
	{
	}

	void Connection::api(Local<FunctionTemplate> & tpl)
	{
		 Nan::SetPrototypeMethod(tpl, "close", close);
		 Nan::SetPrototypeMethod(tpl, "open", open);
		 Nan::SetPrototypeMethod(tpl, "query", query);
		 Nan::SetPrototypeMethod(tpl, "bindQuery", bind_query);
		 Nan::SetPrototypeMethod(tpl, "prepare", prepare);
		 Nan::SetPrototypeMethod(tpl, "readColumn", read_column);
		 Nan::SetPrototypeMethod(tpl, "beginTransaction", begin_transaction);
		 Nan::SetPrototypeMethod(tpl, "commit", commit);
		 Nan::SetPrototypeMethod(tpl, "rollback", rollback);
		 Nan::SetPrototypeMethod(tpl, "nextResult", read_next_result);
		 Nan::SetPrototypeMethod(tpl, "callProcedure", call_procedure);
		 Nan::SetPrototypeMethod(tpl, "unbind", unbind);
		 Nan::SetPrototypeMethod(tpl, "freeStatement", free_statement);
		 Nan::SetPrototypeMethod(tpl, "cancelQuery", cancel_statement);
		 Nan::SetPrototypeMethod(tpl, "pollingMode", polling_mode);
	}

	void Connection::Init(Local<Object> exports) {
		const auto context = exports->CreationContext();
  		Nan::HandleScope scope;
		const auto initialized = OdbcConnection::InitializeEnvironment();
		const auto name = Nan::New("Connection").ToLocalChecked();
		if (!initialized) {
			const nodeTypeFactory fact;
			MutateJS::set_property_value(exports, name, Nan::Null());
			fact.throwError("Unable to initialize msnodesql");
			return;
		}

		// Prepare constructor template
		auto tpl = Nan::New<FunctionTemplate>(New);
		tpl->SetClassName(name);
		tpl->InstanceTemplate()->SetInternalFieldCount(1);

		api(tpl);

  		constructor.Reset(tpl->GetFunction(context).ToLocalChecked());
		Nan::Set(exports, name, tpl->GetFunction(context).ToLocalChecked());
 	}

	Connection::~Connection()
	{
		// close the connection now since the object is being collected
		//connectionBridge->Collect();
	}

	void Connection::close(const Nan::FunctionCallbackInfo<v8::Value>& info)
	{
		const auto cb = info[0].As<Object>();
		const auto* const connection = Unwrap<Connection>(info.This());
		const auto ret = connection->connectionBridge->close(cb);
		info.GetReturnValue().Set(ret);
	}

	void Connection::begin_transaction(const Nan::FunctionCallbackInfo<v8::Value>& info)
	{
		const auto cb = info[0].As<Object>();
		const auto* const connection = Unwrap<Connection>(info.This());
		const auto ret = connection->connectionBridge->begin_transaction(cb);
		info.GetReturnValue().Set(ret);
	}

	void Connection::commit(const Nan::FunctionCallbackInfo<v8::Value>& info)
	{
		const auto cb = info[0].As<Object>();
		const auto* const connection = Unwrap<Connection>(info.This());
		const auto ret = connection->connectionBridge->commit(cb);
		info.GetReturnValue().Set(ret);
	}

	void Connection::rollback(const Nan::FunctionCallbackInfo<v8::Value>& info)
	{
		const auto cb = info[0].As<Object>();
		const auto* const connection = Unwrap<Connection>(info.This());
		const auto ret = connection->connectionBridge->rollback(cb);
		info.GetReturnValue().Set(ret);
	}

	void Connection::New(const Nan::FunctionCallbackInfo<v8::Value>& info) {
		const auto context = info.GetIsolate()->GetCurrentContext();
  		if (info.IsConstructCall()) {
    		// Invoked as constructor: `new MyObject(...)`
            auto* obj = new Connection();
    		obj->Wrap(info.This());
    		info.GetReturnValue().Set(info.This());
  		} else {
    		// Invoked as plain function `MyObject(...)`, turn into construct call.
    		constexpr auto argc = 1;
    		Local<Value> argv[argc] = {info[0]};
            const auto cons = Nan::New<Function>(constructor);
    		info.GetReturnValue().Set(
        	cons->NewInstance(context, argc, argv).ToLocalChecked());
  		}
	}

	void Connection::query(const Nan::FunctionCallbackInfo<v8::Value>& info)
	{
		const auto query_id = info[0].As<Number>();
		const auto query_object = info[1].As<Object>();
		const auto params = info[2].As<Array>();
		const auto callback = info[3].As<Object>();

		const auto* const connection = Unwrap<Connection>(info.This());
		const auto ret = connection->connectionBridge->query(query_id, query_object, params, callback);
		info.GetReturnValue().Set(ret);
	}

	void Connection::prepare(const Nan::FunctionCallbackInfo<v8::Value>& info)
	{
		const auto query_id = info[0].As<Number>();
		const auto query_object = info[1].As<Object>();
		const auto callback = info[2].As<Object>();

		const auto* const connection = Unwrap<Connection>(info.This());
		const auto ret = connection->connectionBridge->prepare(query_id, query_object, callback);
		info.GetReturnValue().Set(ret);
	}

	void Connection::bind_query(const Nan::FunctionCallbackInfo<v8::Value>& info)
	{
		const auto query_id = info[0].As<Number>();
		const auto params = info[1].As<Array>();
		const auto callback = info[2].As<Object>();

		const auto* const connection = Unwrap<Connection>(info.This());
		const auto ret = connection->connectionBridge->query_prepared(query_id, params, callback);
		info.GetReturnValue().Set(ret);
	}

	void Connection::call_procedure(const Nan::FunctionCallbackInfo<v8::Value>& info)
	{
		// need to ensure the signature is changed (in js ?) to form (?) = call sproc (?, ? ... );
		const auto query_id = info[0].As<Number>();
		const auto query_object = info[1].As<Object>();
		const auto params = info[2].As<Array>();
		const auto callback = info[3].As<Object>();

		const auto* const connection = Unwrap<Connection>(info.This());
		const auto ret = connection->connectionBridge->call_procedure(query_id, query_object, params, callback);
		info.GetReturnValue().Set(ret);
	}

	void Connection::unbind(const Nan::FunctionCallbackInfo<v8::Value>& info)
	{
		const auto query_id = info[0].As<Number>();
		const auto callback = info[1].As<Object>();
		const auto* const connection = Unwrap<Connection>(info.This());
		const auto ret = connection->connectionBridge->unbind_parameters(query_id, callback);
		info.GetReturnValue().Set(ret);
	}

	void Connection::free_statement(const Nan::FunctionCallbackInfo<v8::Value>& info)
	{
		const auto query_id = info[0].As<Number>();
		const auto callback = info[1].As<Object>();
		const auto* const connection = Unwrap<Connection>(info.This());
		const auto ret = connection->connectionBridge->free_statement(query_id, callback);
		info.GetReturnValue().Set(ret);
	}

	void Connection::read_column(const Nan::FunctionCallbackInfo<v8::Value>& info)
	{
		const auto query_id = info[0].As<Number>();
		const auto number_rows = info[1].As<Number>();
		const auto cb = info[2].As<Object>();
		const auto* const connection = Unwrap<Connection>(info.This());
		const auto ret = connection->connectionBridge->read_column(query_id, number_rows, cb);
		info.GetReturnValue().Set(ret);
	}

	void Connection::read_next_result(const Nan::FunctionCallbackInfo<v8::Value>& info)
	{
		const auto query_id = info[0].As<Number>();
		const auto callback = info[1].As<Object>();
		const auto* const connection = Unwrap<Connection>(info.This());
		const auto ret = connection->connectionBridge->read_next_result(query_id, callback);
		info.GetReturnValue().Set(ret);
	}

	void Connection::open(const Nan::FunctionCallbackInfo<v8::Value>& info)
	{
		const auto connection_object = info[0].As<Object>();
		const auto callback = info[1].As<Object>();

		const auto* const connection = Unwrap<Connection>(info.This());
		const auto ret = connection->connectionBridge->open(connection_object, callback, info.This());
		info.GetReturnValue().Set(ret);
	}

	void Connection::cancel_statement(const Nan::FunctionCallbackInfo<v8::Value>& info)
	{
		const auto query_id = info[0].As<Number>();
		const auto callback = info[1].As<Object>();
		const auto* const connection = Unwrap<Connection>(info.This());

		const auto ret = connection->connectionBridge->cancel(query_id, callback);
		info.GetReturnValue().Set(ret);
	}

	void Connection::polling_mode(const Nan::FunctionCallbackInfo<v8::Value>& info)
	{
		const auto query_id = info[0].As<Number>();
		const auto v1 = info[1].As<Boolean>();
		const auto callback = info[2].As<Object>();
		const auto* const connection = Unwrap<Connection>(info.This());
		const nodeTypeFactory fact;
		const auto context = fact.isolate->GetCurrentContext();
		const auto maybe = v1->Int32Value(context);
		const auto i32 = maybe.FromMaybe(0);
		const auto b1 = Nan::New(i32 > 0);

		const auto ret = connection->connectionBridge->polling_mode(query_id, b1, callback);
		info.GetReturnValue().Set(ret);
	}
}
