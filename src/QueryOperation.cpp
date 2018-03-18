#include "stdafx.h"
#include <OdbcConnection.h>
#include <OdbcStatement.h>
#include <OdbcStatementCache.h>
#include <QueryOperation.h>
#include <QueryOperationParams.h>
#include <BoundDatumSet.h>

namespace mssql
{
	QueryOperation::QueryOperation(
		const shared_ptr<OdbcConnection> &connection, 
		const shared_ptr<QueryOperationParams> &query, 
		const Handle<Object> callback) :
		OdbcOperation(connection, callback),
		_query(query),
		output_param_count(0)
	{
		_statementId = static_cast<long>(_query->id());
		_params = make_shared<BoundDatumSet>();
	}

	bool QueryOperation::ParameterErrorToUserCallback(const uint32_t param, const char* error) const
	{
		nodeTypeFactory fact;

		_params->clear();

		stringstream full_error;
		full_error << "IMNOD: [msnodesql] Parameter " << param + 1 << ": " << error;

		auto err = fact.error(full_error);
		const auto imn = fact.new_string("IMNOD");
		err->Set(fact.new_string("sqlstate"), imn);
		err->Set(fact.new_string("code"), fact.new_integer(-1));

		Local<Value> args[1];
		args[0] = err;
		const auto argc = 1;

		fact.scopedCallback(_callback, argc, args);

		return false;
	}

	bool QueryOperation::bind_parameters(Handle<Array> &node_params) const
	{
		const auto res = _params->bind(node_params);
		if (!res)
		{
			ParameterErrorToUserCallback(_params->first_error, _params->err);
		}

		return res;
	}

	bool QueryOperation::TryInvokeOdbc()
	{
		_statement = _connection->statements->checkout(_statementId);	
		_statement->set_polling(_query->polling());
		return _statement->try_execute_direct(_query, _params);
	}

	Local<Value> QueryOperation::CreateCompletionArg()
	{
		return _statement->get_meta_value();
	}
}