#include "stdafx.h"
#include "OdbcStatement.h"
#include "ReadColumnOperation.h"

namespace mssql
{
	bool ReadColumnOperation::TryInvokeOdbc()
	{
		if (statement == nullptr) return false;
		return statement->TryReadColumn(column);
	}

	Local<Value> ReadColumnOperation::CreateCompletionArg()
	{
		return statement->GetColumnValue();
	}
}
