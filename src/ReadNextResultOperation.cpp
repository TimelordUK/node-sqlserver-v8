#include "stdafx.h"
#include "OdbcOperation.h"
#include "OdbcConnection.h"

namespace mssql
{
	bool ReadNextResultOperation::TryInvokeOdbc()
	{
		preRowCount = connection->RowCount();
		auto res = connection->TryReadNextResult();
		postRowCount = connection->RowCount();
		return res;
	}

	Local<Value> ReadNextResultOperation::CreateCompletionArg()
	{
		nodeTypeFactory fact;
		auto more_meta = fact.newObject();
		more_meta->Set(fact.newString("endOfResults"), connection->EndOfResults());
		more_meta->Set(fact.newString("meta"), connection->GetMetaValue());
		more_meta->Set(fact.newString("preRowCount"), fact.newInt32(static_cast<int32_t>(preRowCount)));
		more_meta->Set(fact.newString("rowCount"), fact.newInt32(static_cast<int32_t>(postRowCount)));

		return more_meta;
	}
}