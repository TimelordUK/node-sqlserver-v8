#include "stdafx.h"
#include <OdbcStatement.h>
#include <ReadNextResultOperation.h>

namespace mssql
{
	bool ReadNextResultOperation::TryInvokeOdbc()
	{
		if (!_statement) return false;
		preRowCount = _statement->get_row_count();
		const auto res = _statement->try_read_next_result();
		postRowCount = _statement->get_row_count();
		return res;
	}

	Local<Value> ReadNextResultOperation::CreateCompletionArg()
	{
		const auto more_meta = Nan::New<Object>();
		Nan::Set(more_meta, Nan::New("endOfResults").ToLocalChecked(), _statement->handle_end_of_results());
		Nan::Set(more_meta, Nan::New("endOfRows").ToLocalChecked(), _statement->end_of_rows());
		Nan::Set(more_meta, Nan::New("meta").ToLocalChecked(), _statement->get_meta_value());
		Nan::Set(more_meta, Nan::New("preRowCount").ToLocalChecked(), Nan::New(static_cast<int32_t>(preRowCount)));
		Nan::Set(more_meta, Nan::New("rowCount").ToLocalChecked(), Nan::New(static_cast<int32_t>(postRowCount)));

		return more_meta;
	}
}
