#include "stdafx.h"
#include "OdbcOperation.h"
#include "OdbcConnection.h"

namespace mssql
{
	bool ReadNextResultOperation::TryInvokeOdbc()
	{
		preRowCount = statement->RowCount();
		auto res = statement->TryReadNextResult();
		postRowCount = statement->RowCount();
		return res;
	}

	Local<Value> ReadNextResultOperation::CreateCompletionArg()
	{
		nodeTypeFactory fact;
		auto more_meta = fact.newObject();
		more_meta->Set(fact.newString("endOfResults"), statement->EndOfResults());
		more_meta->Set(fact.newString("meta"), statement->GetMetaValue());
		more_meta->Set(fact.newString("preRowCount"), fact.newInt32(static_cast<int32_t>(preRowCount)));
		more_meta->Set(fact.newString("rowCount"), fact.newInt32(static_cast<int32_t>(postRowCount)));

		return more_meta;
	}
}