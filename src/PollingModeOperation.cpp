#include <v8.h>
#include <OdbcStatement.h>
#include <OperationManager.h>
#include <PollingModeOperation.h>

namespace mssql
{
	bool PollingModeOperation::TryInvokeOdbc()
	{
		if (statement == nullptr) {
			return false;
		}
		return statement->set_polling(_polling);
	}

	Local<Value> PollingModeOperation::CreateCompletionArg()
	{
		nodeTypeFactory fact;
		return fact.null();
	}
}
