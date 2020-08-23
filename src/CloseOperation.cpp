#include "stdafx.h"
#include <OdbcConnection.h>
#include <CloseOperation.h>

namespace mssql
{
	CloseOperation::CloseOperation(const shared_ptr<OdbcConnection> &connection, const Local<Object> callback)
		: OdbcOperation(connection, callback)
	{
	}

	bool CloseOperation::TryInvokeOdbc()
	{
		//fprintf(stderr, "invoke TryClose statementId = %d operationId = %llu\n",
		//	statementId,
		//	OperationID );
		// cerr << "CloseOperation statementId = " << _statementId << endl;
		return _connection->TryClose();
	}

	Local<Value> CloseOperation::CreateCompletionArg()
	{
		const nodeTypeFactory fact;
		return fact.null();
	}
}
