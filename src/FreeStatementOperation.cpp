#include "stdafx.h"
#include <OdbcConnection.h>
#include <OdbcStatementCache.h>
#include <FreeStatementOperation.h>
#include <iostream>

namespace mssql
{
	bool FreeStatementOperation::TryInvokeOdbc()
	{
		// cerr << "FreeStatementOperation() " << _statementId << " " << endl;
		_connection->statements->checkin(_statementId);
		//fprintf(stderr, " checkin statementId %d size %llu\n", statementId, connection->statements->size());
		return true;
	}

	Local<Value> FreeStatementOperation::CreateCompletionArg()
	{
		const nodeTypeFactory fact;
		return fact.null();
	}
}
