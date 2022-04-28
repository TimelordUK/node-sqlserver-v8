#pragma once

#include <v8.h>
#include <Column.h>
#include <BoundDatumHelper.h>
#include <string>

namespace mssql
{
    using namespace std;

    class BigIntColumn : public Column
    {
    public:

		BigIntColumn(int id, DatumStorage::bigint_t d) : Column(id), value(d)
		{
		}

		BigIntColumn(int id, shared_ptr<DatumStorage> storage) : Column(id), value((*storage->bigint_vec_ptr)[0])
		{			
		}

	   inline Local<Value> ToString() override
	   {
		   return AsString<DatumStorage::bigint_t>(value);
	   }

	   inline Local<Value> ToNative() override
	   {
		  return Nan::New((double)value);
	   }

    private:
	   DatumStorage::bigint_t value;
    };
}
