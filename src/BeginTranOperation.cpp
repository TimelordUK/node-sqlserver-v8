#include "stdafx.h"
#include "OdbcOperation.h"
#include "OdbcConnection.h"

namespace mssql
{
	bool BeginTranOperation::TryInvokeOdbc()
	{
		return connection->TryBeginTran();
	}

	Local<Value> BeginTranOperation::CreateCompletionArg()
	{
		nodeTypeFactory fact;
		return fact.null();
	}
}