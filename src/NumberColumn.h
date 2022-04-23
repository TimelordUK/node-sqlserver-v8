#pragma once

#include <v8.h>
#include <Column.h>
#include <BoundDatumHelper.h>
#include <string>

namespace mssql
{
    using namespace std;

    class NumberColumn : public Column
    {
    public:

		NumberColumn(int id, double d) : Column(id), value(d)
		{
		}

		NumberColumn(int id, shared_ptr<DatumStorage> storage) : Column(id), value((*storage->doublevec_ptr)[0])
		{			
		}

	   inline Local<Value> ToString() override
	   {
		   return AsString<double>(value);
	   }

	   inline Local<Value> ToNative() override
	   {
		  return Nan::New(value);
	   }

    private:
	   double value;
    };
}
