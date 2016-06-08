#include "stdafx.h"
#include "OdbcConnection.h"
#include "EndTranOperation.h"

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
