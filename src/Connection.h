//---------------------------------------------------------------------------------------------------------------------------------
// File: Connection.h
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

#pragma once

#include "node_object_wrap.h"
#include "OdbcConnectionBridge.h"

namespace mssql
{
    using namespace std;
    using namespace v8;

    class Connection :node::ObjectWrap
    {
    public:

		Connection();
	   virtual ~Connection();

	   static void Initialize(Handle<Object> target);
	   static void New(const FunctionCallbackInfo<Value>& info);
	   static void Close(const FunctionCallbackInfo<Value>& info);
	   static void BeginTransaction(const FunctionCallbackInfo<Value>& info);
	   static void Commit(const FunctionCallbackInfo<Value>& info);
	   static void Rollback(const FunctionCallbackInfo<Value>& info);
	   static void Open(const FunctionCallbackInfo<Value>& info);
	   static void Query(const FunctionCallbackInfo<Value>& info);
	   static void Prepare(const FunctionCallbackInfo<Value>& info);
	   static void BindQuery(const FunctionCallbackInfo<Value>& info);
	   static void CallProcedure(const FunctionCallbackInfo<Value>& info);	  
	   static void Unbind(const FunctionCallbackInfo<Value>& info);
	   static void FreeStatement(const FunctionCallbackInfo<Value>& info);
	   static void ReadRow(const FunctionCallbackInfo<Value>& info);
	   static void ReadColumn(const FunctionCallbackInfo<Value>& info);
	   static void ReadNextResult(const FunctionCallbackInfo<Value>& info);

	private:
		static Persistent<Function> constructor;
		static void api(Local<FunctionTemplate>& tpl);
		unique_ptr<OdbcConnectionBridge> connectionBridge;
		Persistent<Object> This;
    };
}

