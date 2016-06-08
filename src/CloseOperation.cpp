#include "stdafx.h"
#include "OdbcConnection.h"
#include "CloseOperation.h"

namespace mssql
{
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
