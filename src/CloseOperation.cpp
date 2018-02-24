#include <v8.h>
#include <OdbcConnection.h>
#include <CloseOperation.h>
#include <OperationManager.h>

namespace mssql
{
	CloseOperation::CloseOperation(const shared_ptr<OdbcConnection> &connection, const Handle<Object> callback)
		: OdbcOperation(connection, callback)
	{
	}

	bool CloseOperation::TryInvokeOdbc()
	{
		//fprintf(stderr, "invoke TryClose statementId = %d operationId = %llu\n",
		//	statementId,
		//	OperationID );
		return _connection->TryClose();
	}

	Local<Value> CloseOperation::CreateCompletionArg()
	{
		nodeTypeFactory fact;
		return fact.null();
	}
}
