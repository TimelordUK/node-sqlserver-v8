#include "stdafx.h"
#include "OdbcOperation.h"
#include "OdbcConnection.h"

namespace mssql
{
	PrepareOperation::PrepareOperation(shared_ptr<OdbcConnection> connection, const wstring& query, u_int id, u_int timeout, Handle<Object> callback) :
		QueryOperation(connection, query, id, timeout, callback)
	{
	}

	bool PrepareOperation::TryInvokeOdbc()
	{
		return false;
	}

	Local<Value> PrepareOperation::CreateCompletionArg()
	{
		return connection->GetMetaValue();
	}
}