#include "stdafx.h"
#include "OdbcOperation.h"
#include "OdbcConnection.h"

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