#include "stdafx.h"
#include "OdbcOperation.h"
#include "OdbcConnection.h"

namespace mssql
{
	bool ReadColumnOperation::TryInvokeOdbc()
	{
		return connection->TryReadColumn(column);
	}

	Local<Value> ReadColumnOperation::CreateCompletionArg()
	{
		return connection->GetColumnValue();
	}
}