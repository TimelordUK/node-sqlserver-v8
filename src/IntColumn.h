#pragma once

#include <v8.h>
#include "Column.h"

namespace mssql
{
    using namespace std;

    class IntColumn : public Column
    {
    public:
	   IntColumn(long value) : value(value) {}

	   Handle<Value> ToValue() override
	   {
		  nodeTypeFactory fact;
		  auto v = fact.newInteger(value);
		  return v;
	   }

    private:
	   int value;
    };
}
