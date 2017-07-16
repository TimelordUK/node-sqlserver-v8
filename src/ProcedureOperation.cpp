#include "stdafx.h"
#include "OdbcConnection.h"
#include "OdbcStatement.h"
#include "OdbcStatementCache.h"
#include "ProcedureOperation.h"

namespace mssql
{
	ProcedureOperation::ProcedureOperation(shared_ptr<OdbcConnection> connection, 
		const wstring& query, 
		size_t id, 
		bool polling,
		u_int timeout, 
		Handle<Object> callback) :
		QueryOperation(connection, query, id, polling, timeout, callback)
	{
	}

	bool ProcedureOperation::TryInvokeOdbc()
	{
		statement = connection->statements->checkout(statementId);
		statement->set_polling(polling);
		return statement->try_execute_direct(query, timeout, params);
	}

	Local<Value> ProcedureOperation::CreateCompletionArg()
	{
		nodeTypeFactory fact;
		return statement->get_meta_value();
	}
}