#include "stdafx.h"
#include "OdbcStatement.h"
#include "ReadRowOperation.h"

namespace mssql
{
	bool ReadRowOperation::TryInvokeOdbc()
	{
		if (statement == nullptr) return false;
		// fprintf(stderr, "invoke statement->TryReadRow() statementId = %d\n", statementId);
		bool res = statement->TryReadRow();
		return res;
	}

	Local<Value> ReadRowOperation::CreateCompletionArg()
	{
		auto res = statement->EndOfRows();
		return res;
	}
}
