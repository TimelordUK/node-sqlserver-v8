#include "stdafx.h"
#include "OdbcOperation.h"
#include "OdbcConnection.h"

namespace mssql
{
	QueryOperation::QueryOperation(shared_ptr<OdbcStatement> statement, const wstring& query, u_int id, u_int timeout, Handle<Object> callback) :
		OdbcOperation(statement, callback), timeout(timeout), query(query),
		output_param_count(0)
	{
		ID = id;
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
		return statement->TryExecute(query, timeout, params);
	}

	Local<Value> QueryOperation::CreateCompletionArg()
	{
		return statement->GetMetaValue();
	}
}