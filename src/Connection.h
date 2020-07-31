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

#include <nan.h>
#include "OdbcConnectionBridge.h"

namespace mssql
{
    using namespace std;
    using namespace v8;

    class Connection : public Nan::ObjectWrap
    {
    public:
		static void Init(v8::Local<v8::Object> exports);
		Connection();
		virtual ~Connection();

	private:
		
		static void New(const Nan::FunctionCallbackInfo<v8::Value>& info);
		static void close(const Nan::FunctionCallbackInfo<v8::Value>& info);
		static void begin_transaction(const Nan::FunctionCallbackInfo<v8::Value>& info);
		static void commit(const Nan::FunctionCallbackInfo<v8::Value>& info);
		static void rollback(const Nan::FunctionCallbackInfo<v8::Value>& info);
		static void open(const Nan::FunctionCallbackInfo<v8::Value>& info);
		static void query(const Nan::FunctionCallbackInfo<v8::Value>& info);
		static void prepare(const Nan::FunctionCallbackInfo<v8::Value>& info);
		static void bind_query(const Nan::FunctionCallbackInfo<v8::Value>& info);
		static void call_procedure(const Nan::FunctionCallbackInfo<v8::Value>& info);
		static void unbind(const Nan::FunctionCallbackInfo<v8::Value>& info);
		static void free_statement(const Nan::FunctionCallbackInfo<v8::Value>& info);
		static void read_row(const Nan::FunctionCallbackInfo<v8::Value>& info);
		static void cancel_statement(const Nan::FunctionCallbackInfo<v8::Value>& info);
		static void read_column(const Nan::FunctionCallbackInfo<v8::Value>& info);
		static void read_next_result(const Nan::FunctionCallbackInfo<v8::Value>& info);
		static void polling_mode(const Nan::FunctionCallbackInfo<v8::Value>& info);
		
		static Nan::Persistent<v8::Function> constructor;
		static void api(Local<FunctionTemplate>& tpl);
		unique_ptr<OdbcConnectionBridge> connectionBridge;
		Persistent<Object> This;
    };
}

