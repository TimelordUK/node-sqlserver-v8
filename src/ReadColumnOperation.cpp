#include "stdafx.h"
#include "OdbcOperation.h"
#include "OdbcConnection.h"

namespace mssql
{
	bool ReadColumnOperation::TryInvokeOdbc()
	{
		return statement->TryReadColumn(column);
	}

	Local<Value> ReadColumnOperation::CreateCompletionArg()
	{
		return statement->GetColumnValue();
	}
}