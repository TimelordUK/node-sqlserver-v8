#include "stdafx.h"
#include <OdbcStatement.h>
#include <ReadColumnOperation.h>

namespace mssql
{
	bool ReadColumnOperation::TryInvokeOdbc()
	{
		if (statement == nullptr) return false;
		return statement->try_read_column(column);
	}

	Local<Value> ReadColumnOperation::CreateCompletionArg()
	{
		return statement->get_column_value();
	}
}
