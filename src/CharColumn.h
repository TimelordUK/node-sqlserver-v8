#pragma once

#include <iostream>
#include <memory>
#include <vector>
#include <v8.h>
#include "Column.h"
#include "Utility.h"
#include "BoundDatumHelper.h"
#include <MutateJS.h>

namespace mssql
{
    using namespace std;

    class CharColumn : public Column
    {
    public:
	   virtual ~CharColumn()
	   {
	   }

	   CharColumn(int id, shared_ptr<DatumStorage> s, size_t size) 
	   : 
	   Column(id), 
	   size(size), 
	   storage(s->charvec_ptr)
	   {
	   }

	   CharColumn(int id, shared_ptr<DatumStorage::char_vec_t> s, size_t size) 
	   : 
	   Column(id), 
	   size(size), 
	   storage(s)
	   {
	   }

	   CharColumn(int id, shared_ptr<DatumStorage::char_vec_t> s, size_t offset, size_t size) 
	   : 
	   Column(id), 
	   size(size), 
	   storage(s),
	   offset(offset)
	   {
	   }

	   inline Local<Value> ToString() override
	   {
		  	return ToValue();
	   }

	   inline Local<Value> ToNative() override
	   {
		   	auto sptr = storage->data();
		  	auto s = Nan::Encode(sptr + offset, size, Nan::UTF8);
		  	return s;
	   }

    private:
		size_t size;
		shared_ptr<DatumStorage::char_vec_t> storage;
		size_t offset = 0;
    };
}
