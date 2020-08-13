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

	   inline Local<Value> ToValue() override
	   {
		 	return Nan::New(static_cast<int32_t>(value));
	   }

    private:
	   int64_t value;
    };
}
