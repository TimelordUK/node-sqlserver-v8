#include <v8.h>
#include "OdbcConnection.h"
#include "CloseOperation.h"
#include "OperationManager.h"

namespace mssql
{
	CloseOperation::CloseOperation(shared_ptr<OdbcConnection> connection, Handle<Object> callback)
		: OdbcOperation(connection, callback)
	{
	}

	bool CloseOperation::TryInvokeOdbc()
	{
		//fprintf(stderr, "invoke TryClose statementId = %d operationId = %llu\n",
		//	statementId,
		//	OperationID );
		return connection->TryClose();
	}

	Local<Value> CloseOperation::CreateCompletionArg()
	{
		nodeTypeFactory fact;
		return fact.null();
	}
}
