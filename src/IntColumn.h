#pragma once

#include <v8.h>
#include "Column.h"
#include "BoundDatumHelper.h"

namespace mssql
{
    using namespace std;

    class IntColumn : public Column
    {
    public:
	   IntColumn(shared_ptr<DatumStorage> storage) : value((*storage->int64vec_ptr)[0]) {}

	   Handle<Value> ToValue() override
	   {
		  nodeTypeFactory fact;
		  auto v = fact.newLong(value);
		  return v;
	   }

    private:
	   int64_t value;
    };
}
