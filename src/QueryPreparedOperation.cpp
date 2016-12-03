#include "stdafx.h"
#include "OdbcConnection.h"
#include "OdbcStatement.h"
#include "BoundDatumSet.h"
#include "QueryPreparedOperation.h"

namespace mssql
{
	QueryPreparedOperation::QueryPreparedOperation(shared_ptr<OdbcConnection> connection,  size_t queryId, u_int timeout, Handle<Object> callback) :
		OdbcOperation(connection, callback),
		timeout(timeout),
		output_param_count(0)
	{
		statementId = static_cast<long>(queryId);
		params = make_shared<BoundDatumSet>();
	}

	bool QueryPreparedOperation::ParameterErrorToUserCallback(uint32_t param, const char* error) const
	{
		nodeTypeFactory fact;

		params->clear();

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

	bool QueryPreparedOperation::BindParameters(Handle<Array> &node_params) const
	{
		auto res = params->bind(node_params);
		if (!res)
		{
			ParameterErrorToUserCallback(params->first_error, params->err);
		}

		return res;
	}

	bool QueryPreparedOperation::TryInvokeOdbc()
	{
		if (statement == nullptr) return false;
		return statement->BindFetch(params);
	}

	Local<Value> QueryPreparedOperation::CreateCompletionArg()
	{
		return statement->GetMetaValue();
	}
}
