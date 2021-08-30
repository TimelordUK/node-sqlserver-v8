//---------------------------------------------------------------------------------------------------------------------------------
// File: Column.cpp
// Contents: Column objects from SQL Server to return as Javascript types
// 
// Copyright Microsoft Corporation and contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
//
// You may obtain a copy of the License at:
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//---------------------------------------------------------------------------------------------------------------------------------

#include "stdafx.h"
#include <BinaryColumn.h>

namespace mssql {

	BinaryColumn::BinaryColumn(const int id, const shared_ptr<DatumStorage> s, const size_t l) : Column(id)
	                                                                                             , storage(s->charvec_ptr), len(l), offset(0)
	{
	}

	BinaryColumn::BinaryColumn(const int id, const shared_ptr<DatumStorage> s, const size_t offset, const size_t l) : Column(id)                                                                                             , storage(s->charvec_ptr), len(l), offset(offset)
	{
	}

	Local<Value> BinaryColumn::ToValue()
	{
		const auto* const ptr = storage->data() + offset;
		const auto buff = Nan::CopyBuffer(ptr, len).ToLocalChecked();
		storage->reserve(0);
		storage = nullptr;
		// fprintf(stderr, "[%d], ToValue len = %zu, offset = %zu, ptr = %p, destructed = %d\n", Id(), len, offset, str, destructed);
		return buff;
	}
}   // namespace mssql