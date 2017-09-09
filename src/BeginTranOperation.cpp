#include "OdbcConnection.h"
#include <BeginTranOperation.h>

namespace mssql
{
	BeginTranOperation::BeginTranOperation(shared_ptr<OdbcConnection> connection, Handle<Object> callback)
		: OdbcOperation(connection, callback)
	{
	}

	bool BeginTranOperation::TryInvokeOdbc()
	{
		return _connection->try_begin_tran();
	}

	Local<Value> BeginTranOperation::CreateCompletionArg()
	{
		nodeTypeFactory fact;
		return fact.null();
	}
}
