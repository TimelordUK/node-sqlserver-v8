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

namespace mssql
{
	using namespace std;
	using namespace v8;

	class OdbcConnection;
	class OdbcStatement;

	class OdbcOperation : public Operation
	{
	protected:

		friend OdbcConnection;

		shared_ptr<OdbcConnection> connection;
		shared_ptr<OdbcStatement> statement;
		Persistent<Function> callback;
		Handle<Value> output_param;
		Local<Object> cb;
		void fetchStatement();
		long statementId;

	private:

		bool failed;
		shared_ptr<OdbcError> failure;

	public:

		OdbcOperation(size_t queryId, Local<Object> cb);
		OdbcOperation(shared_ptr<OdbcConnection> connection, size_t queryId, Local<Object>);
		OdbcOperation(shared_ptr<OdbcConnection> connection, Local<Object> cb);

		virtual ~OdbcOperation();
		virtual bool TryInvokeOdbc() = 0;
		virtual Local<Value> CreateCompletionArg() = 0;

		void getFailure();
		void InvokeBackground() override;
		int Error(Local<Value> args[]) const;
		int Success(Local<Value> args[]);
		void CompleteForeground() override;
	};
}

