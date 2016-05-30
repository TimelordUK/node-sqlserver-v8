#include "stdafx.h"
#include "OdbcOperation.h"
#include "OdbcConnection.h"

namespace mssql
{
	ProcedureOperation::ProcedureOperation(shared_ptr<OdbcConnection> connection, const wstring& query, u_int id, u_int timeout, Handle<Object> callback) :
		QueryOperation(connection, query, id, timeout, callback)
	{
		persists = true;
	}

	bool ProcedureOperation::TryInvokeOdbc()
	{
		return connection->TryExecute(query, timeout, params);
	}

	Local<Value> ProcedureOperation::CreateCompletionArg()
	{
		output_param = UnbindParameters();
		return connection->GetMetaValue();
	}
}