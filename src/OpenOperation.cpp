#include "stdafx.h"
#include "OdbcConnection.h"
#include "OpenOperation.h"

namespace mssql
{
	bool OpenOperation::TryInvokeOdbc()
	{
		return connection->TryOpen(connectionString, timeout);
	}

	Local<Value> OpenOperation::CreateCompletionArg()
	{
		nodeTypeFactory fact;
		auto o = fact.newObject(backpointer);
		return o;
	}
}
