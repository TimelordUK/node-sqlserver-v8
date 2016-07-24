#include "stdafx.h"
#include "OdbcStatement.h"
#include "UnbindOperation.h"

namespace mssql
{
	bool UnbindOperation::TryInvokeOdbc()
	{
		if (statement == nullptr) return false;	
		return true;
	}

	Local<Value> UnbindOperation::CreateCompletionArg()
	{
		auto a = statement->UnbindParams();
		auto ret = a->Clone();
		return ret;
	}
}
