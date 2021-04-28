#include "stdafx.h"
#include <FreeStatementOperation.h>
#include <OdbcConnection.h>
#include <OdbcStatementCache.h>

namespace mssql
{
	bool FreeStatementOperation::TryInvokeOdbc()
	{
		// cerr << "FreeStatementOperation() " << _statementId << " " << endl;
		//_connection->getStatamentCache()->checkin(_statementId);
		_connection->getStatamentCache()->checkin(_statementId);
		//fprintf(stderr, " checkin statementId %d size %llu\n", statementId, connection->statements->size());
		return true;
	}

	Local<Value> FreeStatementOperation::CreateCompletionArg()
	{
		const nodeTypeFactory fact;
		return fact.null();
	}
}
