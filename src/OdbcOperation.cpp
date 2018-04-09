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
#include <iostream>

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

	OdbcOperation::OdbcOperation(const shared_ptr<OdbcConnection> &connection, const size_t query_id, Local<Object> cb)
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

	OdbcOperation::OdbcOperation(const shared_ptr<OdbcConnection> & connection, Local<Object> cb)
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
		// std::cout << " invoke_background .... " << timer.get_counter() << endl;
		failed = !TryInvokeOdbc();
		// std::cout << " .... invoke_background " << timer.get_counter() << endl;
		if (failed) {
			getFailure();
		}
	}

	int OdbcOperation::error(Local<Value> args[])
	{
		nodeTypeFactory fact;
		auto err = fact.error(failure->Message());
		err->Set(fact.new_string("sqlstate"), fact.new_string(failure->SqlState()));
		err->Set(fact.new_string("code"), fact.new_integer(failure->Code()));

		auto more = false;
		if (_statement)
		{
			const auto rs = _statement->get_result_set();
			if (rs) more = !rs->EndOfRows();
		}

		args[0] = err;
		if (more) {
			const auto arg = CreateCompletionArg();
			args[1] = fact.new_local_value(arg);
		}
		else
		{
			args[1] = fact.new_array();
		}
		args[2] = fact.new_boolean(more);
		const auto argc = 3;
		return argc;
	}

	int OdbcOperation::success(Local<Value> args[])
	{
		nodeTypeFactory fact;

		args[0] = fact.new_local_value(fact.new_boolean(false));
		const auto arg = CreateCompletionArg();
		args[1] = fact.new_local_value(arg);
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
		Local<Value> args[4];
		const auto argc = failed ? error(args) : success(args);
		auto cons = fact.newCallbackFunction(_callback);		
		auto context = isolate->GetCurrentContext();
		const auto global = context->Global();
		// std::cout << " complete_foreground " << timer.get_counter() << endl;
		args[argc] = fact.new_number(timer.get_counter());
		cons->Call(global, argc, args);
	}
}
