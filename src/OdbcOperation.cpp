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
}
