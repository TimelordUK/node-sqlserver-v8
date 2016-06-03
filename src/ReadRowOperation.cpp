#include "stdafx.h"
#include "OdbcOperation.h"
#include "OdbcConnection.h"

namespace mssql
{
	bool ReadRowOperation::TryInvokeOdbc()
	{
		bool res = statement->TryReadRow();
		return res;
	}

	Local<Value> ReadRowOperation::CreateCompletionArg()
	{
		return statement->EndOfRows();
	}
}