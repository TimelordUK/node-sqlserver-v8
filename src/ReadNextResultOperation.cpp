#include "stdafx.h"
#include <OdbcStatement.h>
#include <ReadNextResultOperation.h>

namespace mssql
{
	bool ReadNextResultOperation::TryInvokeOdbc()
	{
		if (statement == nullptr) return false;
		preRowCount = statement->RowCount();
		const auto res = statement->try_read_next_result();
		postRowCount = statement->RowCount();
		return res;
	}

	Local<Value> ReadNextResultOperation::CreateCompletionArg()
	{
		nodeTypeFactory fact;
		auto more_meta = fact.newObject();
		more_meta->Set(fact.newString("endOfResults"), statement->handle_end_of_results());
		more_meta->Set(fact.newString("meta"), statement->get_meta_value());
		more_meta->Set(fact.newString("preRowCount"), fact.newInt32(static_cast<int32_t>(preRowCount)));
		more_meta->Set(fact.newString("rowCount"), fact.newInt32(static_cast<int32_t>(postRowCount)));

		return more_meta;
	}
}
