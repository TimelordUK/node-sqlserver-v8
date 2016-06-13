#include "stdafx.h"
#include "OdbcConnection.h"
#include "OdbcStatement.h"
#include "OdbcStatementCache.h"
#include "ProcedureOperation.h"

namespace mssql
{
	ProcedureOperation::ProcedureOperation(shared_ptr<OdbcConnection> connection, 
		const wstring& query, 
		size_t id, 
		u_int timeout, 
		Handle<Object> callback) :
		QueryOperation(connection, query, id, timeout, callback)
	{
		// the operation should no longer hold onto the param set, as
		// they are contained within a statement.
		persists = true;
	}

	bool ProcedureOperation::TryInvokeOdbc()
	{
		statement = connection->statements->checkout(statementId);
		return statement->TryExecute(query, timeout, params);
	}

	Local<Value> ProcedureOperation::CreateCompletionArg()
	{
		output_param = UnbindParameters();
		return statement->GetMetaValue();
	}
}