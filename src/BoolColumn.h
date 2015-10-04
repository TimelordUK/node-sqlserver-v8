
#pragma once

#include <v8.h>
#include "Column.h"

namespace mssql
{
    using namespace std;

    class BoolColumn : public Column
    {
    public:
	   BoolColumn(bool value) : value(value) {}

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