#include "stdafx.h"
#include <OdbcStatement.h>
#include <CancelOperation.h>

namespace mssql
{
	bool CancelOperation::TryInvokeOdbc()
	{
		if (!_statement) return false;
		return _statement->cancel();
	}

	Local<Value> CancelOperation::CreateCompletionArg()
	{
		const nodeTypeFactory fact;
		return fact.null();
	}
}
