
#pragma once

#include <v8.h>
#include "Column.h"

namespace mssql
{
	using namespace std;

	class BoolColumn : public Column
	{
	public:
		BoolColumn(shared_ptr<DatumStorage> storage) : value((*storage->charvec_ptr)[0] != 0 ? true : false) {}

		Handle<Value> ToValue() override
		{
			nodeTypeFactory fact;
			auto b = fact.newBoolean(value);
			return b;
		}
	private:
		bool value;
	};
}