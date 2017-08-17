#include <v8.h>
#include <OdbcStatement.h>
#include <CancelOperation.h>
#include <OperationManager.h>

namespace mssql
{
	bool CancelOperation::TryInvokeOdbc()
	{
		if (statement == nullptr) {
			return false;
		}
		return statement->cancel();
	}

	Local<Value> CancelOperation::CreateCompletionArg()
	{
		nodeTypeFactory fact;
		return fact.null();
	}
}
