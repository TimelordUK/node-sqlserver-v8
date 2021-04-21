#include "stdafx.h"
#include <OdbcStatement.h>
#include <PollingModeOperation.h>

namespace mssql
{
	bool PollingModeOperation::TryInvokeOdbc()
	{
		if (!_statement) return false;
		return _statement->set_polling(_polling);
	}

	Local<Value> PollingModeOperation::CreateCompletionArg()
	{
		return Nan::Null();
	}
}
