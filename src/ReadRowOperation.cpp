#include "stdafx.h"
#include "OdbcConnection.h"
#include "ReadRowOperation.h"

namespace mssql
{
	bool ReadRowOperation::TryInvokeOdbc()
	{
		fetchStatement();
		if (statement == nullptr) return false;
		bool res = statement->TryReadRow();
		return res;
	}

	Local<Value> ReadRowOperation::CreateCompletionArg()
	{
		auto res = statement->EndOfRows();

		return res;
	}
}
