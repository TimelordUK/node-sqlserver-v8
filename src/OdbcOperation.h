//---------------------------------------------------------------------------------------------------------------------------------
// File: OdbcOperation.h
// Contents: ODBC Operation objects called on background thread
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

#include "Operation.h"

#include <list>

namespace mssql
{
    using namespace std;
    using namespace v8;

    class OdbcConnection;

    class OdbcOperation : public Operation
    {

    protected:

	   shared_ptr<OdbcConnection> connection;
	   Persistent<Function> callback;
	   Handle<Value> output_param;

    private:

	   bool failed;
	   shared_ptr<OdbcError> failure;

    public:

	   OdbcOperation(shared_ptr<OdbcConnection> connection, Local<Object> cb)
		  : connection(connection),
		  callback(Isolate::GetCurrent(), cb.As<Function>()),
		  failed(false),
		  failure(nullptr)
	   {
		  nodeTypeFactory fact;
		  output_param = fact.null();
	   }

	   virtual ~OdbcOperation()
	   {
		  callback.Reset();
	   }

	   virtual bool TryInvokeOdbc() = 0;
	   virtual Local<Value> CreateCompletionArg() = 0;

	   void InvokeBackground() override;
	   int Error(Local<Value> args[]);
	   int Success(Local<Value> args[]);
	   void CompleteForeground() override;
    };

    class OpenOperation : public OdbcOperation
    {
	   wstring connectionString;
	   Persistent<Object> backpointer;

    public:
	   OpenOperation(shared_ptr<OdbcConnection> connection, const wstring& connectionString, Handle<Object> callback,
		  Handle<Object> backpointer)
		  : OdbcOperation(connection, callback),
		  connectionString(connectionString),
		  backpointer(Isolate::GetCurrent(), backpointer)
	   {
	   }

	   virtual ~OpenOperation(void)
	   {
		  backpointer.Reset();
	   }

	   bool TryInvokeOdbc() override;

	   Local<Value> CreateCompletionArg() override;
    };

    class QueryOperation : public OdbcOperation
    {
    public:

	   struct ParamBinding {

		  enum JS_TYPE {

			 JS_UNKNOWN,
			 JS_NULL,
			 JS_STRING,
			 JS_BOOLEAN,
			 JS_INT,
			 JS_UINT,
			 JS_NUMBER,
			 JS_DATE,
			 JS_BUFFER
		  };

		  JS_TYPE js_type;
		  SQLSMALLINT c_type;
		  SQLSMALLINT sql_type;
		  SQLULEN param_size;
		  SQLSMALLINT digits;
		  SQLPOINTER buffer;
		  SQLLEN buffer_len;
		  SQLLEN indptr;
		  uint16_t param_type;

		  shared_ptr<vector<uint16_t>> vec_ptr;
		  shared_ptr<int32_t> int32_ptr;
		  shared_ptr<uint16_t> uint16_ptr;
		  shared_ptr<uint32_t> uint32_ptr;
		  shared_ptr<double> double_ptr;
		  shared_ptr<int64_t> int64_t_ptr;
		  shared_ptr<SQL_SS_TIMESTAMPOFFSET_STRUCT> time_ptr;

		  ParamBinding(void) :
			 js_type(JS_UNKNOWN),
			 c_type(0),
			 sql_type(0),
			 param_size(0),
			 digits(0),
			 buffer(nullptr),
			 buffer_len(0),
			 indptr(SQL_NULL_DATA),
			 param_type(SQL_PARAM_INPUT)
		  {
		  }

		  ParamBinding(ParamBinding&& other)
		  {
			 js_type = other.js_type;
			 c_type = other.c_type;
			 sql_type = other.sql_type;
			 param_size = other.param_size;
			 digits = other.digits;
			 buffer = other.buffer;
			 buffer_len = other.buffer_len;
			 indptr = other.indptr;

			 vec_ptr = other.vec_ptr;
			 double_ptr = other.double_ptr;
			 int64_t_ptr = other.int64_t_ptr;
			 time_ptr = other.time_ptr;
			 uint32_ptr = other.uint32_ptr;
			 uint16_ptr = other.uint16_ptr;
			 int32_ptr = other.int32_ptr;

			 param_type = other.param_type;

			 other.buffer = nullptr;
			 other.buffer_len = 0;
		  }
	   };

	   void bindNull(ParamBinding & binding, const Local<Value> & p);
	   void bindString(ParamBinding & binding, const Local<Value> & p);
	    void bindString(ParamBinding& binding, const Local<Value>& p, int str_len);
	    void bindBoolean(ParamBinding & binding, const Local<Value> & p);
	   void bindInt32(ParamBinding & binding, const Local<Value> & p);
	   void bindUint32(ParamBinding & binding, const Local<Value> & p);
	   void bindNumber(ParamBinding &binding, const Local<Value> & p);
	   void bindDate(ParamBinding &binding, const Local<Value> & p);
	    void bindInteger(ParamBinding& binding, const Local<Value>& p);
	    void bindDouble(ParamBinding& binding, const Local<Value>& p);
	    void bindDefault(ParamBinding &binding, Local<Value> & p);
	    bool bindDatumType(Local<Value>& p, int i, ParamBinding& binding);
	    bool bind(ParamBinding& binding, int i, Local<Object> o, const char* if_str, uint16_t type);
	    bool bindObject(Handle<Array>& node_params, int i, ParamBinding& binding);
	   bool bindParam(Handle<Array> & node_params, int i, ParamBinding & binding);

	   Handle<Value> unbindNull(ParamBinding & binding);
	   Handle<Value> unbindString(ParamBinding & binding);
	   Handle<Value> unbindBoolean(ParamBinding & binding);
	   Handle<Value> unbindInt32(ParamBinding & binding);
	   Handle<Value> unbindUint32(ParamBinding & binding);
	   Handle<Value> unbindNumber(ParamBinding &binding);
	   Handle<Value> unbindDate(ParamBinding &binding);
	   Local<Value> unbindParam(ParamBinding& param);
	   Handle<Value> unbindDouble(ParamBinding & param_binding);

	   typedef list<ParamBinding> param_bindings; // list because we only insert and traverse in-order

	   QueryOperation(shared_ptr<OdbcConnection> connection, const wstring& query, Handle<Object> callback);

	   bool BindParameters(Handle<Array> & node_params);
	   Local<Array> UnbindParameters();
	   // called by BindParameters when an error occurs.  It passes a node.js error to the user's callback.
	   bool ParameterErrorToUserCallback(uint32_t param, const char* error);

	   bool TryInvokeOdbc() override;

	   Local<Value> CreateCompletionArg() override;

    protected:

	   wstring query;
	   param_bindings params;
	   int output_param_count;
    };

    class ProcedureOperation : public QueryOperation
    {
    public:
	   bool TryInvokeOdbc() override;

	   Local<Value> CreateCompletionArg() override;

	   ProcedureOperation(shared_ptr<OdbcConnection> connection, const wstring& query, Handle<Object> callback);
    };

    class ReadRowOperation : public OdbcOperation
    {
    public:

	   ReadRowOperation(shared_ptr<OdbcConnection> connection, Handle<Object> callback)
		  : OdbcOperation(connection, callback)
	   {
	   }

	   bool TryInvokeOdbc() override;

	   Local<Value> CreateCompletionArg() override;
    };

    class ReadColumnOperation : public OdbcOperation
    {
	   int column;

    public:

	   ReadColumnOperation(shared_ptr<OdbcConnection> connection, int column, Handle<Object> callback)
		  : OdbcOperation(connection, callback),
		  column(column)
	   {
	   }

	   bool TryInvokeOdbc() override;

	   Local<Value> CreateCompletionArg() override;
    };

    class ReadNextResultOperation : public OdbcOperation
    {
    public:
	   ReadNextResultOperation(shared_ptr<OdbcConnection> connection, Handle<Object> callback)
		  : OdbcOperation(connection, callback)
	   {
	   }

	   bool TryInvokeOdbc() override;

	   Local<Value> CreateCompletionArg() override;
    };

    class CloseOperation : public OdbcOperation
    {
    public:
	   CloseOperation(shared_ptr<OdbcConnection> connection, Handle<Object> callback)
		  : OdbcOperation(connection, callback)
	   {
	   }

	   bool TryInvokeOdbc() override;

	   Local<Value> CreateCompletionArg() override;
    };

    class CollectOperation : public OdbcOperation
    {
    public:
	   CollectOperation(shared_ptr<OdbcConnection> connection)
		  : OdbcOperation(connection, Handle<Object>())
	   {
	   }

	   bool TryInvokeOdbc() override;

	   Local<Value> CreateCompletionArg() override;

	   // override to not call a callback
	   void CompleteForeground() override;
    };

    class BeginTranOperation : public OdbcOperation
    {
    public:
	   BeginTranOperation(shared_ptr<OdbcConnection> connection, Handle<Object> callback)
		  : OdbcOperation(connection, callback)
	   {
	   }

	   bool TryInvokeOdbc() override;

	   Local<Value> CreateCompletionArg() override;
    };

    class EndTranOperation : public OdbcOperation
    {
	   SQLSMALLINT completionType;

    public:
	   EndTranOperation(shared_ptr<OdbcConnection> connection, SQLSMALLINT completionType, Handle<Object> callback)
		  : OdbcOperation(connection, callback),
		  completionType(completionType)
	   {
	   }

	   bool TryInvokeOdbc() override;

	   Local<Value> CreateCompletionArg() override;
    };
}

