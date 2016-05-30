#include "stdafx.h"
#include "OdbcOperation.h"
#include "OdbcConnection.h"

namespace mssql
{
	bool EndTranOperation::TryInvokeOdbc()
	{
		return connection->TryEndTran(completionType);
	}

	Local<Value> EndTranOperation::CreateCompletionArg()
	{
		nodeTypeFactory fact;
		return fact.null();
	}
}