#pragma once

#include <stdafx.h>
#include "Column.h"
#include "BoundDatumHelper.h"

namespace mssql
{
    using namespace std;

    class IntColumn : public Column
    {
    public:
	   IntColumn(int id,shared_ptr<DatumStorage> storage) : Column(id), value((*storage->int64vec_ptr)[0])
	   {		   
	   }

	   IntColumn(int id, long v) : Column(id), value(v)
	   {
	   }

	   Local<Value> ToValue() override
	   {
			return Nan::New<Number>(static_cast<double>(value));
	   }

    private:
	   int64_t value;
    };
}
