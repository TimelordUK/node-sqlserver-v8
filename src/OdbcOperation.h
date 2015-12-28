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
#include "BoundDatumSet.h"

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
		Local<Object> cb;

	private:

		bool failed;
		shared_ptr<OdbcError> failure;

	public:

		OdbcOperation(shared_ptr<OdbcConnection> connection, Local<Object> cb)
			: connection(connection),
			callback(Isolate::GetCurrent(), cb.As<Function>()),
			cb(cb),
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
		int Error(Local<Value> args[]) const;
		int Success(Local<Value> args[]);
		void CompleteForeground() override;
	};

	class OpenOperation : public OdbcOperation
	{
		wstring connectionString;
		Persistent<Object> backpointer;
		int timeout;

	public:
		OpenOperation(shared_ptr<OdbcConnection> connection, const wstring& connectionString, int timeout, Handle<Object> callback,
			Handle<Object> backpointer)
			: OdbcOperation(connection, callback),
			connectionString(connectionString),
			backpointer(Isolate::GetCurrent(), backpointer),
			timeout(timeout)
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
		QueryOperation(shared_ptr<OdbcConnection> connection, const wstring& query, u_int timeout, Handle<Object> callback);

		bool BindParameters(Handle<Array> & node_params);
		Local<Array> UnbindParameters();
		// called by BindParameters when an error occurs.  It passes a node.js error to the user's callback.
		bool ParameterErrorToUserCallback(uint32_t param, const char* error);

		bool TryInvokeOdbc() override;

		Local<Value> CreateCompletionArg() override;

	protected:

		u_int timeout;
		wstring query;
		BoundDatumSet params;
		int output_param_count;
	};

	class ProcedureOperation : public QueryOperation
	{
	public:
		bool TryInvokeOdbc() override;

		Local<Value> CreateCompletionArg() override;

		ProcedureOperation(shared_ptr<OdbcConnection> connection, const wstring& query, u_int timeout, Handle<Object> callback);
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
			: OdbcOperation(connection, callback), preRowCount(-1), postRowCount(-1)
		{
		}

		bool TryInvokeOdbc() override;

		Local<Value> CreateCompletionArg() override;
		SQLLEN preRowCount;
		SQLLEN postRowCount;
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

