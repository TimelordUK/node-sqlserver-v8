#include "stdafx.h"
#include "OdbcConnection.h"
#include "CollectOperation.h"

namespace mssql
{
	CollectOperation::CollectOperation(shared_ptr<OdbcConnection> connection)
		: OdbcOperation(connection, Handle<Object>())
	{
	}

	bool CollectOperation::TryInvokeOdbc()
	{
		return connection->TryClose();
	}

	Local<Value> CollectOperation::CreateCompletionArg()
	{
		nodeTypeFactory fact;
		return fact.null();
	}

	// override to not call a callback
	void CollectOperation::CompleteForeground()
	{
	}
}
