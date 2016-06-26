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
#include "ResultSet.h"

namespace mssql
{
    using namespace v8;

    static const wchar_t* mapType(SQLSMALLINT datatype)
    {
	   const wchar_t* typeName;

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
		  typeName = L"text";
		  break;
	   case SQL_BIT:
		  typeName = L"boolean";
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
		  typeName = L"number";
		  break;
	   case SQL_TYPE_TIME:
	   case SQL_SS_TIME2:
	   case SQL_TYPE_TIMESTAMP:
	   case SQL_TYPE_DATE:
	   case SQL_SS_TIMESTAMPOFFSET:
		  typeName = L"date";
		  break;
	   case SQL_BINARY:
	   case SQL_VARBINARY:
	   case SQL_LONGVARBINARY:
	   case SQL_SS_UDT:
		  typeName = L"binary";
		  break;
	   default:
		  typeName = L"text";
		  break;
	   }
	   return typeName;
    }

	Local<Object> ResultSet::getEntry(nodeTypeFactory & fact, const ColumnDefinition & definition)  {

		auto typeName = mapType(definition.dataType);
		auto entry = fact.newObject();
		entry->Set(fact.fromTwoByte(L"size"), fact.newInteger(static_cast<int32_t>(definition.columnSize)));
		entry->Set(fact.fromTwoByte(L"name"), fact.fromTwoByte(definition.name.c_str()));
		entry->Set(fact.fromTwoByte(L"nullable"), fact.newBoolean(definition.nullable != 0));  
		entry->Set(fact.fromTwoByte(L"type"), fact.fromTwoByte(typeName));
		entry->Set(fact.fromTwoByte(L"sqlType"), fact.fromTwoByte(definition.dataTypeName.c_str()));
		if (definition.dataType == SQL_SS_UDT) {
			entry->Set(fact.fromTwoByte(L"udtType"), fact.fromTwoByte(definition.udtTypeName.c_str()));
		}
		return entry;
	}

    Handle<Value> ResultSet::MetaToValue()
    {
	   nodeTypeFactory fact;
	   auto metadata = fact.newArray();

	   for_each(this->metadata.begin(), this->metadata.end(), [&](const ColumnDefinition & definition) {
		  metadata->Set(metadata->Length(), getEntry(fact, definition));
	   });

	   return metadata;
    }
}
