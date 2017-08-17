#include "stdafx.h"
#include <OdbcConnection.h>
#include <EndTranOperation.h>

namespace mssql
{
	EndTranOperation::EndTranOperation(shared_ptr<OdbcConnection> connection, 
		SQLSMALLINT completion_type, Handle<Object> callback)
		: OdbcOperation(connection, callback),
		completionType(completion_type)
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
