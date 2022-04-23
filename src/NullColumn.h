
#pragma once

#include <v8.h>
#include <Column.h>

namespace mssql
{
    using namespace std;

    class NullColumn : public Column
    {
    public:
		NullColumn(int id) : Column(id)
		{		
		}

	   inline Local<Value> ToString() override
	   {
		  nodeTypeFactory fact;
		  return fact.null();
	   }

	   Local<Value> ToNative() override
	   {
		  nodeTypeFactory fact;
		  return fact.null();
	   }
    }; 
}
