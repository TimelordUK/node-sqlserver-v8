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
#include "Connection.h"

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
    }

    void Connection::Initialize(Handle<Object> exports)
    {
	    auto initialized = OdbcConnection::InitializeEnvironment();
	   nodeTypeFactory fact;
	   auto connection = fact.newString("Connection");
	   if (!initialized) {
		  exports->Set(connection, fact.undefined());
		  fact.throwError("Unable to initialize msnodesql");
		  return;
	   }

	   auto tpl = fact.newTemplate(New);

	   tpl->InstanceTemplate()->SetInternalFieldCount(1);
	   tpl->SetClassName(connection);

	   api(tpl);
	   auto fn = tpl->GetFunction();
	   constructor.Reset(Isolate::GetCurrent(), fn);
	   exports->Set(connection, fn);
    }

    Connection::~Connection(void)
    {
	   // close the connection now since the object is being collected
		//connectionBridge->Collect();
    }

    void Connection::Close(const FunctionCallbackInfo<Value>& info)
    {
	   auto cb = info[0].As<Object>();
	   auto connection = Unwrap<Connection>(info.This());
	   auto ret = connection->connectionBridge->Close(cb);
	   info.GetReturnValue().Set(ret);
    }

    void Connection::BeginTransaction(const FunctionCallbackInfo<Value>& info)
    {
	   auto cb = info[0].As<Object>();
	   auto connection = Unwrap<Connection>(info.This());
	   auto ret = connection->connectionBridge->BeginTransaction(cb);
	   info.GetReturnValue().Set(ret);
    }

    void Connection::Commit(const FunctionCallbackInfo<Value>& info)
    {
	   auto cb = info[0].As<Object>();
	   auto connection = Unwrap<Connection>(info.This());
	   auto ret = connection->connectionBridge->Commit(cb);
	   info.GetReturnValue().Set(ret);
    }

    void Connection::Rollback(const FunctionCallbackInfo<Value>& info)
    {
	   auto cb = info[0].As<Object>();
	   auto connection = Unwrap<Connection>(info.This());
	   auto ret = connection->connectionBridge->Rollback(cb);
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
		auto queryId = info[0].As<Number>();
		auto queryObject = info[1].As<Object>();
		auto params = info[2].As<Array>();
		auto callback = info[3].As<Object>();

		auto connection = Unwrap<Connection>(info.This());
		auto ret = connection->connectionBridge->Query(queryId, queryObject, params, callback);
		info.GetReturnValue().Set(ret);
    }

	void Connection::Prepare(const FunctionCallbackInfo<Value>& info)
	{
		auto queryId = info[0].As<Number>();
		auto queryObject = info[1].As<Object>();
		auto callback = info[2].As<Object>();

		auto connection = Unwrap<Connection>(info.This());
		auto ret = connection->connectionBridge->Prepare(queryId, queryObject, callback);
		info.GetReturnValue().Set(ret);
	}

	void Connection::BindQuery(const FunctionCallbackInfo<Value>& info)
	{
		auto queryId = info[0].As<Number>();
		auto params = info[1].As<Array>();
		auto callback = info[2].As<Object>();

		auto connection = Unwrap<Connection>(info.This());
		auto ret = connection->connectionBridge->QueryPrepared(queryId, params, callback);
		info.GetReturnValue().Set(ret);
	}

	void Connection::CallProcedure(const FunctionCallbackInfo<Value>& info)
	{
		// need to ensure the signature is changed (in js ?) to form (?) = call sproc (?, ? ... );
		auto queryId = info[0].As<Number>();
		auto queryObject = info[1].As<Object>();
		auto params = info[2].As<Array>();
		auto callback = info[3].As<Object>();

		auto connection = Unwrap<Connection>(info.This());
		auto ret = connection->connectionBridge->CallProcedure(queryId, queryObject, params, callback);
		info.GetReturnValue().Set(ret);
	}

	void Connection::Unbind(const FunctionCallbackInfo<Value>& info)
	{
		auto queryId = info[0].As<Number>();
		auto callback = info[1].As<Object>();
		auto connection = Unwrap<Connection>(info.This());
		auto ret = connection->connectionBridge->UnbindParameters(queryId, callback);
		info.GetReturnValue().Set(ret);
	}

	void Connection::FreeStatement(const FunctionCallbackInfo<Value>& info)
	{
		auto queryId = info[0].As<Number>();		
		auto callback = info[1].As<Object>();
		auto connection = Unwrap<Connection>(info.This());
		auto ret = connection->connectionBridge->FreeStatement(queryId, callback);
		info.GetReturnValue().Set(ret);
	}

	void Connection::ReadRow(const FunctionCallbackInfo<Value>& info)
	{
		auto queryId = info[0].As<Number>();
		auto cb = info[1].As<Object>();
		auto connection = Unwrap<Connection>(info.This());
		auto ret = connection->connectionBridge->ReadRow(queryId, cb);
		info.GetReturnValue().Set(ret);
	}

	void Connection::ReadColumn(const FunctionCallbackInfo<Value>& info)
	{
		auto queryId = info[0].As<Number>();
		auto column = info[1].As<Number>();
		auto cb = info[2].As<Object>();
		auto connection = Unwrap<Connection>(info.This());
		auto ret = connection->connectionBridge->ReadColumn(queryId, column, cb);
		info.GetReturnValue().Set(ret);
	}

	void Connection::ReadNextResult(const FunctionCallbackInfo<Value>& info)
	{
		auto queryId = info[0].As<Number>();
		auto callback = info[1].As<Object>();
		auto connection = Unwrap<Connection>(info.This());
		auto ret = connection->connectionBridge->ReadNextResult(queryId, callback);
		info.GetReturnValue().Set(ret);
	}

    void Connection::Open(const FunctionCallbackInfo<Value>& info)
    {
	   auto connectionObject = info[0].As<Object>();
	   auto callback = info[1].As<Object>();

	   auto connection = Unwrap<Connection>(info.This());
	   auto ret = connection->connectionBridge->Open(connectionObject, callback, info.This());
	   info.GetReturnValue().Set(ret);
    }
}

NODE_MODULE(sqlserver, mssql::Connection::Initialize)

