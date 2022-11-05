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
	OdbcOperation::OdbcOperation(const shared_ptr<OdbcConnection> &connection, const size_t query_id, Local<Object> cb)
		: Nan::AsyncWorker(new Nan::Callback(cb.As<Function>())),
		_connection(connection),
		_statement(nullptr),
		_callback(Isolate::GetCurrent(), cb.As<Function>()),
		_cb(cb),
		_can_lock(true),
		_failed(false),
		_failures(nullptr)	
	{
		_statementId = static_cast<long>(query_id);
		const nodeTypeFactory fact;
		_output_param = fact.null();
	}

	OdbcOperation::OdbcOperation(const size_t query_id, const Local<Object> cb)
	: OdbcOperation(nullptr, -1, cb) {	
	}

	OdbcOperation::OdbcOperation(const shared_ptr<OdbcConnection> & connection, Local<Object> cb)
	: OdbcOperation(connection, -1, cb) {	
	}

	void OdbcOperation::Execute () {
		if (_statement && _can_lock) {
		 	const std::lock_guard<std::mutex> lock(_statement->_statement_mutex);
		// std::cout << " invoke_background .... " << timer.get_counter() << endl;
			_failed = !TryInvokeOdbc();
		} else {
			_failed = !TryInvokeOdbc();
		}
		// std::cout << " .... invoke_background " << timer.get_counter() << endl;
		if (_failed) {
			getFailure();
		}
	}

	void OdbcOperation::HandleOKCallback () {
		if (_callback.IsEmpty()) return;
		Local<Value> args[4];
		const auto argc = _failed ? error(args) : success(args);
		// std::cout << " complete_foreground " << timer.get_counter() << endl;
		//args[argc] = fact.new_number(timer.get_counter());
		Nan::Call(Nan::New(_callback), Nan::GetCurrentContext()->Global(), argc, args);
	}

	OdbcOperation::~OdbcOperation()
	{
		_callback.Reset();
		// int count = _statement.use_count();
		// cerr << "~OdbcOperation statementId " << _statementId << " count " << count << endl;
	}

	bool OdbcOperation::fetch_statement()
	{
		_statement = _connection->getStatamentCache()->checkout(_statementId);
		// int count = _statement.use_count();
		// cerr << "fetch_statement statementId " << _statementId << " count " << count << endl;
		const bool res = _statement ? true : false;
		return res;
	}

	void OdbcOperation::getFailure()
	{
		if (_connection) {
			_failures = _connection->errors();
		}
		if (!_failures || (_failures->empty() && _statement)) {
			_failures = _statement->errors();
		}
		if (!_failures || _failures->empty())
		{
			_failures = make_shared<vector<shared_ptr<OdbcError>>>();
			if (!_statement) {
				_failures->push_back(make_shared<OdbcError>("0000", "cannot call dead statement", -1, 0, "", "", 0));
			} else {
				_failures->push_back(make_shared<OdbcError>("unknown", "internal error", -1, 0, "", "", 0));
			}
		}
	}

	int OdbcOperation::error(Local<Value> args[])
	{
		const nodeTypeFactory fact;
		const unsigned int error_count = _failures ? static_cast<int>(_failures->size()) : 0;
		const auto errors = fact.new_array(error_count);
		for (unsigned int i = 0; i < error_count; ++i)
		{
			const auto failure = (*_failures)[i];
			const auto err = fact.error(failure->Message());
			Nan::Set(err, Nan::New("sqlstate").ToLocalChecked(), Nan::New(failure->SqlState()).ToLocalChecked());
			Nan::Set(err, Nan::New("code").ToLocalChecked(), Nan::New(failure->Code()));
			Nan::Set(err, Nan::New("severity").ToLocalChecked(), Nan::New(failure->Severity()));
			Nan::Set(err, Nan::New("serverName").ToLocalChecked(), Nan::New(failure->ServerName()).ToLocalChecked());
			Nan::Set(err, Nan::New("procName").ToLocalChecked(), Nan::New(failure->ProcName()).ToLocalChecked());
			Nan::Set(err, Nan::New("lineNumber").ToLocalChecked(), Nan::New(failure->LineNumber()));
			Nan::Set(errors, i, err);
		}
		
		auto more = false;
		if (_statement)
		{
			const auto rs = _statement->get_result_set();
			if (rs) more = !rs->EndOfRows();
		}

		args[0] = errors;
		if (more) {
			const auto arg = CreateCompletionArg();
			args[1] = Nan::New<Value>(arg);
		}
		else
		{
			args[1] = fact.new_array();
		}
		args[2] = Nan::New(more);
		constexpr auto argc = 3;
		return argc;
	}

	int OdbcOperation::success(Local<Value> args[])
	{
		args[0] = Nan::New(false);
		const auto arg = CreateCompletionArg();
		args[1] = arg;
		const auto c = _output_param->IsNull() ? 0 : _output_param.As<Array>()->Length();
		if (c > 0) args[2] = _output_param;
		const auto argc = c == 0 ? 2 : 3;
		return argc;
	}
}
