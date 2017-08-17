#include "stdafx.h"
#include <OdbcConnection.h>
#include <OdbcStatement.h>
#include <OdbcStatementCache.h>
#include <ProcedureOperation.h>
#include <QueryOperationParams.h>

namespace mssql
{
	ProcedureOperation::ProcedureOperation(shared_ptr<OdbcConnection> connection, 
		shared_ptr<QueryOperationParams> query,
		Handle<Object> callback) :
		QueryOperation(connection, query, callback)
	{
	}

	bool ProcedureOperation::TryInvokeOdbc()
	{
		statement = connection->statements->checkout(statementId);
		statement->set_polling(_query->polling());
		return statement->try_execute_direct(_query, params);
	}

	Local<Value> ProcedureOperation::CreateCompletionArg()
	{
		return statement->get_meta_value();
	}
}