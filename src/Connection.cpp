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

namespace mssql
{
	using namespace v8;

	Persistent<Function> Connection::constructor;

	Connection::Connection()
		: connectionBridge(make_unique<OdbcConnectionBridge>())
	{
	}

	void Connection::api(Local<FunctionTemplate> & tpl)
	{
		NODE_SET_PROTOTYPE_METHOD(tpl, "close", Close);
		NODE_SET_PROTOTYPE_METHOD(tpl, "open", Open);
		NODE_SET_PROTOTYPE_METHOD(tpl, "query", Query);
		NODE_SET_PROTOTYPE_METHOD(tpl, "bindQuery", BindQuery);
		NODE_SET_PROTOTYPE_METHOD(tpl, "prepare", Prepare);
		NODE_SET_PROTOTYPE_METHOD(tpl, "readRow", ReadRow);
		NODE_SET_PROTOTYPE_METHOD(tpl, "readColumn", ReadColumn);
		NODE_SET_PROTOTYPE_METHOD(tpl, "beginTransaction", BeginTransaction);
		NODE_SET_PROTOTYPE_METHOD(tpl, "commit", Commit);
		NODE_SET_PROTOTYPE_METHOD(tpl, "rollback", Rollback);
		NODE_SET_PROTOTYPE_METHOD(tpl, "nextResult", ReadNextResult);
		NODE_SET_PROTOTYPE_METHOD(tpl, "callProcedure", CallProcedure);
		NODE_SET_PROTOTYPE_METHOD(tpl, "unbind", Unbind);
		NODE_SET_PROTOTYPE_METHOD(tpl, "freeStatement", FreeStatement);
		NODE_SET_PROTOTYPE_METHOD(tpl, "cancelQuery", CancelStatement);
		NODE_SET_PROTOTYPE_METHOD(tpl, "pollingMode", PollingMode);
	}

	void Connection::Initialize(Handle<Object> exports)
	{
		const auto initialized = OdbcConnection::InitializeEnvironment();
		nodeTypeFactory fact;
		const auto connection = fact.newString("Connection");
		if (!initialized) {
			exports->Set(connection, fact.undefined());
			fact.throwError("Unable to initialize msnodesql");
			return;
		}

		auto tpl = fact.newTemplate(New);

		tpl->InstanceTemplate()->SetInternalFieldCount(1);
		tpl->SetClassName(connection);

		api(tpl);
		const auto fn = tpl->GetFunction();
		constructor.Reset(Isolate::GetCurrent(), fn);
		exports->Set(connection, fn);
	}

	Connection::~Connection()
	{
		// close the connection now since the object is being collected
		//connectionBridge->Collect();
	}

	void Connection::Close(const FunctionCallbackInfo<Value>& info)
	{
		const auto cb = info[0].As<Object>();
		auto connection = Unwrap<Connection>(info.This());
		const auto ret = connection->connectionBridge->Close(cb);
		info.GetReturnValue().Set(ret);
	}

	void Connection::BeginTransaction(const FunctionCallbackInfo<Value>& info)
	{
		const auto cb = info[0].As<Object>();
		auto connection = Unwrap<Connection>(info.This());
		const auto ret = connection->connectionBridge->BeginTransaction(cb);
		info.GetReturnValue().Set(ret);
	}

	void Connection::Commit(const FunctionCallbackInfo<Value>& info)
	{
		const auto cb = info[0].As<Object>();
		auto connection = Unwrap<Connection>(info.This());
		const auto ret = connection->connectionBridge->Commit(cb);
		info.GetReturnValue().Set(ret);
	}

	void Connection::Rollback(const FunctionCallbackInfo<Value>& info)
	{
		const auto cb = info[0].As<Object>();
		auto connection = Unwrap<Connection>(info.This());
		const auto ret = connection->connectionBridge->Rollback(cb);
		info.GetReturnValue().Set(ret);
	}

	void Connection::New(const FunctionCallbackInfo<Value>& info)
	{
		if (!info.IsConstructCall()) {
			return;
		}

		auto c = new Connection();
		c->Wrap(info.This());
		info.GetReturnValue().Set(info.This());
	}

	void Connection::Query(const FunctionCallbackInfo<Value>& info)
	{
		const auto query_id = info[0].As<Number>();
		const auto query_object = info[1].As<Object>();
		const auto params = info[2].As<Array>();
		const auto callback = info[3].As<Object>();

		const auto connection = Unwrap<Connection>(info.This());
		const auto ret = connection->connectionBridge->Query(query_id, query_object, params, callback);
		info.GetReturnValue().Set(ret);
	}

	void Connection::Prepare(const FunctionCallbackInfo<Value>& info)
	{
		const auto query_id = info[0].As<Number>();
		const auto query_object = info[1].As<Object>();
		const auto callback = info[2].As<Object>();

		const auto connection = Unwrap<Connection>(info.This());
		const auto ret = connection->connectionBridge->Prepare(query_id, query_object, callback);
		info.GetReturnValue().Set(ret);
	}

	void Connection::BindQuery(const FunctionCallbackInfo<Value>& info)
	{
		const auto query_id = info[0].As<Number>();
		const auto params = info[1].As<Array>();
		const auto callback = info[2].As<Object>();

		const auto connection = Unwrap<Connection>(info.This());
		const auto ret = connection->connectionBridge->QueryPrepared(query_id, params, callback);
		info.GetReturnValue().Set(ret);
	}

	void Connection::CallProcedure(const FunctionCallbackInfo<Value>& info)
	{
		// need to ensure the signature is changed (in js ?) to form (?) = call sproc (?, ? ... );
		const auto query_id = info[0].As<Number>();
		const auto query_object = info[1].As<Object>();
		const auto params = info[2].As<Array>();
		const auto callback = info[3].As<Object>();

		const auto connection = Unwrap<Connection>(info.This());
		const auto ret = connection->connectionBridge->CallProcedure(query_id, query_object, params, callback);
		info.GetReturnValue().Set(ret);
	}

	void Connection::Unbind(const FunctionCallbackInfo<Value>& info)
	{
		const auto query_id = info[0].As<Number>();
		const auto callback = info[1].As<Object>();
		auto connection = Unwrap<Connection>(info.This());
		const auto ret = connection->connectionBridge->UnbindParameters(query_id, callback);
		info.GetReturnValue().Set(ret);
	}

	void Connection::FreeStatement(const FunctionCallbackInfo<Value>& info)
	{
		const auto query_id = info[0].As<Number>();
		const auto callback = info[1].As<Object>();
		auto connection = Unwrap<Connection>(info.This());
		const auto ret = connection->connectionBridge->FreeStatement(query_id, callback);
		info.GetReturnValue().Set(ret);
	}

	void Connection::ReadRow(const FunctionCallbackInfo<Value>& info)
	{
		const auto query_id = info[0].As<Number>();
		const auto cb = info[1].As<Object>();
		const auto connection = Unwrap<Connection>(info.This());
		const auto ret = connection->connectionBridge->ReadRow(query_id, cb);
		info.GetReturnValue().Set(ret);
	}

	void Connection::ReadColumn(const FunctionCallbackInfo<Value>& info)
	{
		const auto query_id = info[0].As<Number>();
		const auto column = info[1].As<Number>();
		const auto cb = info[2].As<Object>();
		const auto connection = Unwrap<Connection>(info.This());
		const auto ret = connection->connectionBridge->ReadColumn(query_id, column, cb);
		info.GetReturnValue().Set(ret);
	}

	void Connection::ReadNextResult(const FunctionCallbackInfo<Value>& info)
	{
		const auto query_id = info[0].As<Number>();
		const auto callback = info[1].As<Object>();
		const auto connection = Unwrap<Connection>(info.This());
		const auto ret = connection->connectionBridge->ReadNextResult(query_id, callback);
		info.GetReturnValue().Set(ret);
	}

	void Connection::Open(const FunctionCallbackInfo<Value>& info)
	{
		const auto connection_object = info[0].As<Object>();
		const auto callback = info[1].As<Object>();

		auto connection = Unwrap<Connection>(info.This());
		const auto ret = connection->connectionBridge->Open(connection_object, callback, info.This());
		info.GetReturnValue().Set(ret);
	}

	void Connection::CancelStatement(const FunctionCallbackInfo<Value>& info)
	{
		const auto query_id = info[0].As<Number>();
		const auto callback = info[1].As<Object>();
		auto connection = Unwrap<Connection>(info.This());

		const auto ret = connection->connectionBridge->Cancel(query_id, callback);
		info.GetReturnValue().Set(ret);
	}

	void Connection::PollingMode(const FunctionCallbackInfo<Value>& info)
	{
		const auto query_id = info[0].As<Number>();
		const auto v1 = info[1].As<Number>();
		const auto callback = info[2].As<Object>();
		auto connection = Unwrap<Connection>(info.This());
		nodeTypeFactory fact;
		const auto i32 = v1->Int32Value();
		const auto b1 = fact.newBoolean(i32 > 0);

		const auto ret = connection->connectionBridge->PollingMode(query_id, b1, callback);
		info.GetReturnValue().Set(ret);
	}
}

NODE_MODULE(sqlserver, mssql::Connection::Initialize)

