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
		static NAN_MODULE_INIT(Init);
		Connection();
		virtual ~Connection();

	private:
		typedef Nan::NAN_METHOD_ARGS_TYPE NanCb;
		static NAN_METHOD(New);
		static NAN_METHOD(close);
		static NAN_METHOD(begin_transaction);
		static NAN_METHOD(commit);
		static NAN_METHOD(rollback);
		static NAN_METHOD(open);
		static NAN_METHOD(query);
		static NAN_METHOD(prepare);
		static NAN_METHOD(bind_query);
		static NAN_METHOD(call_procedure);
		static NAN_METHOD(unbind);
		static NAN_METHOD(free_statement);
		static NAN_METHOD(read_row);
		static NAN_METHOD(cancel_statement);
		static NAN_METHOD(read_column);
		static NAN_METHOD(read_next_result);
		static NAN_METHOD(polling_mode);
		
		static Nan::Persistent<v8::Function> constructor;
		static void api(Local<FunctionTemplate>& tpl);
		unique_ptr<OdbcConnectionBridge> connectionBridge;
		Persistent<Object> This;
    };
}

