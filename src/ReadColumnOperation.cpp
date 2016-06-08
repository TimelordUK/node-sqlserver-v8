#include "stdafx.h"
#include "OdbcConnection.h"
#include "ReadColumnOperation.h"

namespace mssql
{
	bool ReadColumnOperation::TryInvokeOdbc()
	{
		fetchStatement();
		if (statement == nullptr) return false;
		return statement->TryReadColumn(column);
	}

	Local<Value> ReadColumnOperation::CreateCompletionArg()
	{
		return statement->GetColumnValue();
	}
}
