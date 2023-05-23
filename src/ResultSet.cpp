//---------------------------------------------------------------------------------------------------------------------------------
// File: ResultSet.cpp
// Contents: ResultSet object that holds metadata and current column to return to Javascript
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
#include <ResultSet.h>

namespace mssql
{
    using namespace v8;

    static const char* map_type(const SQLSMALLINT datatype)
    {
	   const char* type_name;

	   switch (datatype)
	   {
	   case SQL_CHAR:
	   case SQL_VARCHAR:
	   case SQL_LONGVARCHAR:
	   case SQL_WCHAR:
	   case SQL_WVARCHAR:
	   case SQL_WLONGVARCHAR:
	   case SQL_GUID:
	   case SQL_SS_XML:
		  type_name = "text";
		  break;
	   case SQL_BIT:
		  type_name = "boolean";
		  break;
	   case SQL_SMALLINT:
	   case SQL_TINYINT:
	   case SQL_INTEGER:
	   case SQL_DECIMAL:
	   case SQL_NUMERIC:
	   case SQL_REAL:
	   case SQL_FLOAT:
	   case SQL_DOUBLE:
	   case SQL_BIGINT:
		  type_name = "number";
		  break;
	   case SQL_TYPE_TIME:
	   case SQL_SS_TIME2:
	   case SQL_TYPE_TIMESTAMP:
	   case SQL_TYPE_DATE:
	   case SQL_SS_TIMESTAMPOFFSET:
		  type_name = "date";
		  break;
	   case SQL_BINARY:
	   case SQL_VARBINARY:
	   case SQL_LONGVARBINARY:
	   case SQL_SS_UDT:
		  type_name = "binary";
		  break;
	   default:
		  type_name = "text";
		  break;
	   }
	   return type_name;
    }

	shared_ptr<Column> ResultSet::get_column(const size_t row_id, const size_t column_id) const
	{
		if (row_id >= _rows.size())
		{
			return nullptr;
		}
		const auto& row = _rows[row_id];
		return row[column_id];
	}

	void ResultSet::add_column(const size_t row_id, const shared_ptr<Column> &column)
	{
		if (_rows.size() < row_id + 1)
		{
			_rows.resize(row_id + 1);
		}
		auto &row = _rows[row_id];
		if (row.size() != _metadata.size())
		{
			row.resize(_metadata.size());
		}
		row[column->Id()] = column;
	}

	Local<Object> ResultSet::get_entry(const ColumnDefinition & definition)  {
		const auto* const type_name = map_type(definition.dataType);
		const auto entry = Nan::New<Object>();
		const Local<Value> managedName = Nan::Encode(definition.name.data(), definition.name.size() * 2, Nan::UCS2);
		Nan::Set(entry, Nan::New("size").ToLocalChecked(), Nan::New(static_cast<int32_t>(definition.columnSize)));
		Nan::Set(entry, Nan::New("name").ToLocalChecked(), managedName);
		Nan::Set(entry, Nan::New("nullable").ToLocalChecked(), Nan::New(definition.nullable != 0));
		Nan::Set(entry, Nan::New("type").ToLocalChecked(), Nan::New(type_name).ToLocalChecked());
		Nan::Set(entry, Nan::New("sqlType").ToLocalChecked(), Nan::New(definition.dataTypeName.c_str()).ToLocalChecked());
		if (definition.dataType == SQL_SS_UDT) {
			Nan::Set(entry, Nan::New("udtType").ToLocalChecked(), Nan::New(definition.udtTypeName.c_str()).ToLocalChecked());
		}
		return entry;
	}

	Local<Value> ResultSet::meta_to_value()
    {
	   const nodeTypeFactory fact;
	   auto metadata = fact.new_array();

	   for_each(this->_metadata.begin(), this->_metadata.end(), [metadata](const ColumnDefinition & definition) {
		   Nan::Set(metadata, metadata->Length(), get_entry(definition));
	   });

	   return metadata;
    }
}
