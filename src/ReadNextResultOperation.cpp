#include "stdafx.h"
#include <OdbcStatement.h>
#include <ReadNextResultOperation.h>

namespace mssql
{
	bool ReadNextResultOperation::TryInvokeOdbc()
	{
		if (_statement == nullptr) return false;
		preRowCount = _statement->get_row_count();
		const auto res = _statement->try_read_next_result();
		postRowCount = _statement->get_row_count();
		return res;
	}

	Local<Value> ReadNextResultOperation::CreateCompletionArg()
	{
		nodeTypeFactory fact;
		auto more_meta = fact.newObject();
		more_meta->Set(fact.newString("endOfResults"), _statement->handle_end_of_results());
		more_meta->Set(fact.newString("meta"), _statement->get_meta_value());
		more_meta->Set(fact.newString("preRowCount"), fact.newInt32(static_cast<int32_t>(preRowCount)));
		more_meta->Set(fact.newString("rowCount"), fact.newInt32(static_cast<int32_t>(postRowCount)));

		return more_meta;
	}
}
