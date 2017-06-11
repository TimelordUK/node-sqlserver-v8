#include "stdafx.h"
#include "OdbcConnection.h"
#include "OdbcStatement.h"
#include "OdbcStatementCache.h"
#include "QueryOperation.h"
#include "BoundDatumSet.h"

namespace mssql
{
	QueryOperation::QueryOperation(shared_ptr<OdbcConnection> connection, const wstring& query, size_t queryId, u_int timeout, Handle<Object> callback) :
		OdbcOperation(connection, callback),
		timeout(timeout),
		query(query),
		output_param_count(0)
	{
		statementId = static_cast<long>(queryId);
		params = make_shared<BoundDatumSet>();
	}

	bool QueryOperation::ParameterErrorToUserCallback(uint32_t param, const char* error) const
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
		auto argc = 1;

		fact.scopedCallback(callback, argc, args);

		return false;
	}

	bool QueryOperation::BindParameters(Handle<Array> &node_params) const
	{
		auto res = params->bind(node_params);
		if (!res)
		{
			ParameterErrorToUserCallback(params->first_error, params->err);
		}

		return res;
	}

	bool QueryOperation::TryInvokeOdbc()
	{
		statement = connection->statements->checkout(statementId);	
		return statement->TryExecuteDirect(query, timeout, params);
	}

	Local<Value> QueryOperation::CreateCompletionArg()
	{
		return statement->GetMetaValue();
	}
}