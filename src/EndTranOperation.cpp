#include "stdafx.h"
#include "OdbcConnection.h"
#include "EndTranOperation.h"

namespace mssql
{
	EndTranOperation::EndTranOperation(shared_ptr<OdbcConnection> connection, 
		SQLSMALLINT completionType, Handle<Object> callback)
		: OdbcOperation(connection, callback),
		completionType(completionType)
	{
	}

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
