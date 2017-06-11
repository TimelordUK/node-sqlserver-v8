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
#include "OdbcStatement.h"
#include "OdbcStatementCache.h"

namespace mssql
{
	OdbcOperation::OdbcOperation(size_t queryId, Local<Object> cb)
		:
		connection(nullptr),
		statement(nullptr),
		callback(Isolate::GetCurrent(), cb.As<Function>()),
		cb(cb),
		failed(false),
		failure(nullptr)
	{
		statementId = static_cast<long>(queryId);
		nodeTypeFactory fact;
		output_param = fact.null();
	}

	OdbcOperation::OdbcOperation(shared_ptr<OdbcConnection> connection, size_t queryId, Local<Object> cb)
		: 
		connection(connection),
		statement(nullptr),
		callback(Isolate::GetCurrent(), cb.As<Function>()),
		cb(cb),
		failed(false),
		failure(nullptr)
	{
		statementId = static_cast<long>(queryId);
		nodeTypeFactory fact;
		output_param = fact.null();
	}

	OdbcOperation::OdbcOperation(shared_ptr<OdbcConnection> connection, Local<Object> cb)
		:
		connection(connection),
		statement(nullptr),
		callback(Isolate::GetCurrent(), cb.As<Function>()),
		cb(cb),
		failed(false),
		failure(nullptr)
	{
		statementId = -1;
		nodeTypeFactory fact;
		output_param = fact.null();
	}

	OdbcOperation::~OdbcOperation()
	{
		callback.Reset();
	}

	void OdbcOperation::fetchStatement()
	{
		statement = connection->statements->checkout(statementId);
	}

	void OdbcOperation::getFailure()
	{
		if (connection) {
			failure = connection->LastError();
		}
		if (!failure && statement) {
			failure = statement->LastError();
		}
		if (!failure)
		{
			failure = make_shared<OdbcError>("unknown", "internal error", -1);
		}
	}

	void OdbcOperation::InvokeBackground()
	{
		failed = !TryInvokeOdbc();

		if (failed) {
			getFailure();
		}
	}

	int OdbcOperation::Error(Local<Value> args[]) const
	{
		nodeTypeFactory fact;
		auto err = fact.error(failure->Message());
		err->Set(fact.newString("sqlstate"), fact.newString(failure->SqlState()));
		err->Set(fact.newString("code"), fact.newInteger(failure->Code()));
		
		auto more  = false;
		if (statement)
		{
			auto rs = statement->GetResultSet();
			if (rs) more = !rs->EndOfRows();
		}

		args[0] = err;
		args[1] = fact.newArray();
		args[2] = fact.newBoolean(more);
		auto argc = 3;
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
		auto argc = c == 0 ? 2 : 3;
		return argc;
	}

	void OdbcOperation::CompleteForeground()
	{
		auto isolate = Isolate::GetCurrent();
		HandleScope scope(isolate);
		nodeTypeFactory fact;
		if (callback.IsEmpty()) return;
		Local<Value> args[3];
		auto argc = failed ? Error(args) : Success(args);
		auto cons = fact.newCallbackFunction(callback);		
		auto context = isolate->GetCurrentContext();
		auto global = context->Global();
		cons->Call(global, argc, args);
	}
}
