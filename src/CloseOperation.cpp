#include "stdafx.h"
#include "OdbcOperation.h"
#include "OdbcConnection.h"

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