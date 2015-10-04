#pragma once

#include <v8.h>
#include "Column.h"

namespace mssql
{
    using namespace std;

    class NumberColumn : public Column
    {
    public:
	   NumberColumn(double value) : value(value) {}

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