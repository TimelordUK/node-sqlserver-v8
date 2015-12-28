//---------------------------------------------------------------------------------------------------------------------------------
// File: OdbcOperation.cpp
// Contents: Functions called by thread queue for background ODBC operations
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
#include "OdbcOperation.h"
#include "OdbcConnection.h"
#include <sstream>

// undo these tokens to use numeric_limits below
#undef min
#undef max

namespace mssql
{
	// default precision and scale for date/time parameters
	// (This may be updated for older server since they don't have as high a precision)
	const int SQL_SERVER_2008_DEFAULT_DATETIME_PRECISION = 34;
	const int SQL_SERVER_2008_DEFAULT_DATETIME_SCALE = 7;

	void OdbcOperation::InvokeBackground()
	{
		failed = !TryInvokeOdbc();

		if (failed) {
			failure = connection->LastError();
		}
	}

	int OdbcOperation::Error(Local<Value> args[]) const
	{
		nodeTypeFactory fact;
		auto err = fact.error(failure->Message());
		err->Set(fact.newString("sqlstate"), fact.newString(failure->SqlState()));
		err->Set(fact.newString("code"), fact.newInteger(failure->Code()));
		args[0] = err;
		int argc = 1;
		return argc;
	}

	int OdbcOperation::Success(Local<Value> args[])
	{
		nodeTypeFactory fact;

		args[0] = fact.newLocalValue(fact.newBoolean(false));
		auto arg = CreateCompletionArg();
		args[1] = fact.newLocalValue(arg);
		int c = output_param->IsNull() ? 0 : output_param.As<Array>()->Length();
		if (c > 0) args[2] = output_param;
		int argc = c == 0 ? 2 : 3;
		return argc;
	}

	void OdbcOperation::CompleteForeground()
	{
		auto isolate = Isolate::GetCurrent();
		HandleScope scope(isolate);
		nodeTypeFactory fact;
		if (callback.IsEmpty()) return;
		int argc;
		Local<Value> args[3];
		argc = failed ? Error(args) : Success(args);
		auto cons = fact.newCallbackFunction(callback);		
		auto context = isolate->GetCurrentContext();
		auto global = context->Global();
		cons->Call(global, argc, args);
	}

	bool OpenOperation::TryInvokeOdbc()
	{
		return connection->TryOpen(connectionString, timeout);
	}

	Local<Value> OpenOperation::CreateCompletionArg()
	{
		nodeTypeFactory fact;
		auto o = fact.newObject(backpointer);
		return o;
	}

	QueryOperation::QueryOperation(shared_ptr<OdbcConnection> connection, const wstring& query, u_int timeout,  Handle<Object> callback) :
		OdbcOperation(connection, callback), timeout(timeout), query(query),
		output_param_count(0)
	{
	}

	bool QueryOperation::ParameterErrorToUserCallback(uint32_t param, const char* error)
	{
		nodeTypeFactory fact;

		params.clear();

		stringstream full_error;
		full_error << "IMNOD: [msnodesql] Parameter " << param + 1 << ": " << error;

		auto err = fact.error(full_error);
		auto imn = fact.newString("IMNOD");
		err->Set(fact.newString("sqlstate"), imn);
		err->Set(fact.newString("code"), fact.newInteger(-1));

		Local<Value> args[1];
		args[0] = err;
		int argc = 1;

		fact.scopedCallback(callback, argc, args);

		return false;
	}

	bool QueryOperation::BindParameters(Handle<Array> &node_params)
	{
		auto res = params.bind(node_params);
		if (!res)
		{
			ParameterErrorToUserCallback(params.first_error, params.err);
		}

		return res;
	}

	Local<Array> QueryOperation::UnbindParameters()
	{
		return params.unbind();
	}

	bool QueryOperation::TryInvokeOdbc()
	{
		return connection->TryExecute(query, timeout, params);
	}

	Local<Value> QueryOperation::CreateCompletionArg()
	{
		return connection->GetMetaValue();
	}

	bool ReadRowOperation::TryInvokeOdbc()
	{
		bool res = connection->TryReadRow();
		return res;
	}

	Local<Value> ReadRowOperation::CreateCompletionArg()
	{
		return connection->EndOfRows();
	}

	bool ReadColumnOperation::TryInvokeOdbc()
	{
		return connection->TryReadColumn(column);
	}

	Local<Value> ReadColumnOperation::CreateCompletionArg()
	{
		return connection->GetColumnValue();
	}

	bool ReadNextResultOperation::TryInvokeOdbc()
	{
		preRowCount = connection->RowCount();
		auto res = connection->TryReadNextResult();
		postRowCount = connection->RowCount();
		return res;
	}

	Local<Value> ReadNextResultOperation::CreateCompletionArg()
	{
		nodeTypeFactory fact;
		auto more_meta = fact.newObject();
		more_meta->Set(fact.newString("endOfResults"), connection->EndOfResults());
		more_meta->Set(fact.newString("meta"), connection->GetMetaValue());
		more_meta->Set(fact.newString("preRowCount"), fact.newInt32(static_cast<int32_t>(preRowCount)));
		more_meta->Set(fact.newString("rowCount"), fact.newInt32(static_cast<int32_t>(postRowCount)));

		return more_meta;
	}

	bool CloseOperation::TryInvokeOdbc()
	{
		return connection->TryClose();
	}

	Local<Value> CloseOperation::CreateCompletionArg()
	{
		nodeTypeFactory fact;
		return fact.null();
	}

	bool CollectOperation::TryInvokeOdbc()
	{
		return connection->TryClose();
	}

	Local<Value> CollectOperation::CreateCompletionArg()
	{
		nodeTypeFactory fact;
		return fact.null();
	}

	// override to not call a callback
	void CollectOperation::CompleteForeground()
	{
	}

	bool BeginTranOperation::TryInvokeOdbc()
	{
		return connection->TryBeginTran();
	}

	Local<Value> BeginTranOperation::CreateCompletionArg()
	{
		nodeTypeFactory fact;
		return fact.null();
	}

	bool EndTranOperation::TryInvokeOdbc()
	{
		return connection->TryEndTran(completionType);
	}

	Local<Value> EndTranOperation::CreateCompletionArg()
	{
		nodeTypeFactory fact;
		return fact.null();
	}

	ProcedureOperation::ProcedureOperation(shared_ptr<OdbcConnection> connection, const wstring& query, u_int timeout, Handle<Object> callback) :
		QueryOperation(connection, query, timeout, callback)
	{
		persists = true;
	}

	bool ProcedureOperation::TryInvokeOdbc()
	{
		return connection->TryExecute(query, timeout, params);
	}

	Local<Value> ProcedureOperation::CreateCompletionArg()
	{
		output_param = UnbindParameters();
		return connection->GetMetaValue();
	}
}
