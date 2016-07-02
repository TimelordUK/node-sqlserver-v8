#pragma once

#include <v8.h>
#include "Column.h"
#include "BoundDatumHelper.h"

namespace mssql
{
    using namespace std;

    class NumberColumn : public Column
    {
    public:
		NumberColumn(shared_ptr<DatumStorage> storage) : value((*storage->doublevec_ptr)[0]) {}

	   Handle<Value> ToValue() override
	   {
		  nodeTypeFactory fact;
		  auto o = fact.newNumber(value);
		  return o;
	   }

    private:
	   double value;
    };
}