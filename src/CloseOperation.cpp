#include "stdafx.h"
#include "OdbcConnection.h"
#include "CloseOperation.h"

namespace mssql
{
	CloseOperation::CloseOperation(shared_ptr<OdbcConnection> connection, Handle<Object> callback)
		: OdbcOperation(connection, callback)
	{
	}

	bool CloseOperation::TryInvokeOdbc()
	{
		return connection->TryClose();
	}

	Local<Value> CloseOperation::CreateCompletionArg()
	{
		nodeTypeFactory fact;
		return fact.null();
	}
}
