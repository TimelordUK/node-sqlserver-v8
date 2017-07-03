#include "stdafx.h"
#include "OdbcConnection.h"
#include "OdbcStatement.h"
#include "OdbcStatementCache.h"
#include "PrepareOperation.h"

namespace mssql
{
	PrepareOperation::PrepareOperation(
		shared_ptr<OdbcConnection> connection,
		const wstring& query,
		size_t id,
		bool polling,
		u_int timeout,
		Handle<Object> callback) :
		QueryOperation(connection, query, id, polling, timeout, callback)
	{
	}

	bool PrepareOperation::TryInvokeOdbc()
	{
		statement = connection->statements->checkout(statementId);
		if (statement == nullptr) return false;
		statement->setPolling(polling);
		return statement->TryPrepare(query, timeout);
	}
}