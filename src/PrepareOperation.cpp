#include "stdafx.h"
#include <OdbcConnection.h>
#include <OdbcStatement.h>
#include <OdbcStatementCache.h>
#include <PrepareOperation.h>
#include <QueryOperationParams.h>

namespace mssql
{
	PrepareOperation::PrepareOperation(
		shared_ptr<OdbcConnection> connection,
		shared_ptr<QueryOperationParams> query,
		Handle<Object> callback) :
		QueryOperation(connection, query, callback)
	{
	}

	bool PrepareOperation::TryInvokeOdbc()
	{
		statement = connection->statements->checkout(statementId);
		if (statement == nullptr) return false;
		statement->set_polling(_query->polling());
		return statement->try_prepare(_query);
	}
}