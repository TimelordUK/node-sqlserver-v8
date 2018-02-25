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
#include <OdbcOperation.h>
#include <OdbcConnection.h>
#include <OdbcStatement.h>
#include <OdbcStatementCache.h>

namespace mssql
{
	OdbcOperation::OdbcOperation(const size_t query_id, Local<Object> cb)
		:
		_connection(nullptr),
		_statement(nullptr),
		_callback(Isolate::GetCurrent(), cb.As<Function>()),
		_cb(cb),
		failed(false),
		failure(nullptr)
	{
		_statementId = static_cast<long>(query_id);
		nodeTypeFactory fact;
		_output_param = fact.null();
	}

	OdbcOperation::OdbcOperation(const shared_ptr<OdbcConnection> connection, const size_t query_id, Local<Object> cb)
		: 
		_connection(connection),
		_statement(nullptr),
		_callback(Isolate::GetCurrent(), cb.As<Function>()),
		_cb(cb),
		failed(false),
		failure(nullptr)
	{
		_statementId = static_cast<long>(query_id);
		nodeTypeFactory fact;
		_output_param = fact.null();
	}

	OdbcOperation::OdbcOperation(const shared_ptr<OdbcConnection> connection, Local<Object> cb)
		:
		_connection(connection),
		_statement(nullptr),
		_callback(Isolate::GetCurrent(), cb.As<Function>()),
		_cb(cb),
		failed(false),
		failure(nullptr)
	{
		_statementId = -1;
		nodeTypeFactory fact;
		_output_param = fact.null();
	}

	OdbcOperation::~OdbcOperation()
	{
		_callback.Reset();
	}

	void OdbcOperation::fetch_statement()
	{
		_statement = _connection->statements->checkout(_statementId);
	}

	void OdbcOperation::getFailure()
	{
		if (_connection) {
			failure = _connection->LastError();
		}
		if (!failure && _statement) {
			failure = _statement->get_last_error();
		}
		if (!failure)
		{
			failure = make_shared<OdbcError>("unknown", "internal error", -1);
		}
	}

	void OdbcOperation::invoke_background()
	{
		failed = !TryInvokeOdbc();

		if (failed) {
			getFailure();
		}
	}

	int OdbcOperation::Error(Local<Value> args[])
	{
		nodeTypeFactory fact;
		auto err = fact.error(failure->Message());
		err->Set(fact.newString("sqlstate"), fact.newString(failure->SqlState()));
		err->Set(fact.newString("code"), fact.newInteger(failure->Code()));

		auto more = false;
		if (_statement)
		{
			const auto rs = _statement->get_result_set();
			if (rs) more = !rs->EndOfRows();
		}

		args[0] = err;
		if (more) {
			const auto arg = CreateCompletionArg();
			args[1] = fact.newLocalValue(arg);
		}
		else
		{
			args[1] = fact.newArray();
		}
		args[2] = fact.newBoolean(more);
		const auto argc = 3;
		return argc;
	}

	int OdbcOperation::Success(Local<Value> args[])
	{
		nodeTypeFactory fact;

		args[0] = fact.newLocalValue(fact.newBoolean(false));
		const auto arg = CreateCompletionArg();
		args[1] = fact.newLocalValue(arg);
		const int c = _output_param->IsNull() ? 0 : _output_param.As<Array>()->Length();
		if (c > 0) args[2] = _output_param;
		const auto argc = c == 0 ? 2 : 3;
		return argc;
	}

	void OdbcOperation::complete_foreground()
	{
		auto isolate = Isolate::GetCurrent();
		HandleScope scope(isolate);
		nodeTypeFactory fact;
		if (_callback.IsEmpty()) return;
		Local<Value> args[3];
		const auto argc = failed ? Error(args) : Success(args);
		auto cons = fact.newCallbackFunction(_callback);		
		auto context = isolate->GetCurrentContext();
		const auto global = context->Global();
		cons->Call(global, argc, args);
	}
}
