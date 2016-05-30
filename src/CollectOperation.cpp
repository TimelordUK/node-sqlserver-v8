#include "stdafx.h"
#include "OdbcOperation.h"
#include "OdbcConnection.h"

namespace mssql
{
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