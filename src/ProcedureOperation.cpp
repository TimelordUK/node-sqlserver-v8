#include "stdafx.h"
#include "OdbcOperation.h"
#include "OdbcConnection.h"

namespace mssql
{
	ProcedureOperation::ProcedureOperation(shared_ptr<OdbcStatement> statement, const wstring& query, u_int id, u_int timeout, Handle<Object> callback) :
		QueryOperation(statement, query, id, timeout, callback)
	{
		persists = true;
	}

	bool ProcedureOperation::TryInvokeOdbc()
	{
		return statement->TryExecute(query, timeout, params);
	}

	Local<Value> ProcedureOperation::CreateCompletionArg()
	{
		output_param = UnbindParameters();
		return statement->GetMetaValue();
	}
}