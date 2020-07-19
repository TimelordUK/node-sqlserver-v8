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

    class StringColumn : public Column
    {
    public:
	   virtual ~StringColumn()
	   {
	   }

	   StringColumn(int id, shared_ptr<DatumStorage> s, size_t size) 
	   : 
	   Column(id), 
	   size(size), 
	   storage(s->uint16vec_ptr)
	   {
	   }

	   StringColumn(int id, shared_ptr<DatumStorage::uint16_t_vec_t> s, size_t size) 
	   : 
	   Column(id), 
	   size(size), 
	   storage(s)
	   {
	   }

	   StringColumn(int id, shared_ptr<DatumStorage::uint16_t_vec_t> s, size_t offset, size_t size) 
	   : 
	   Column(id), 
	   size(size), 
	   storage(s),
	   offset(offset)
	   {
	   }
		
	   Local<Value> ToValue() override
	   {
		  auto sptr = storage->data();
		  auto len = size + 1;
		  nodeTypeFactory fact;
		  vector<char> c_str;
		  c_str.reserve(len);
		  c_str.resize(len);
		  const char* ptr = reinterpret_cast<const char*>(sptr + offset);
		  for (unsigned long i = 0, j = 0; i < len * 2; i += 2, j++) {
				c_str[j] = ptr[i];
		  }	
		  c_str.resize(len - 1);
		  auto s = fact.new_string(c_str.data());
		  return s;
	   }

    private:
		size_t size;
		shared_ptr<DatumStorage::uint16_t_vec_t> storage;
		size_t offset = 0;
    };

    class StringUtf8Column : public Column
    {
    public:
	   virtual ~StringUtf8Column()
	   {
	   }

	   StringUtf8Column(int id, shared_ptr<DatumStorage> s, size_t size) 
	   : 
		Column(id), 
		size(size), 
		storage(s->charvec_ptr)
	   {
	   }

	   StringUtf8Column(int id, shared_ptr<DatumStorage::char_vec_t> s, size_t size) 
	   : 
		Column(id), 
		size(size), 
		storage(s)
	   {
	   }

	   StringUtf8Column(int id, shared_ptr<DatumStorage::char_vec_t> s, size_t offset, size_t size) 
	   : 
		Column(id), 
		size(size), 
		storage(s),
		offset(offset)
	   {
	   }
		
	   Local<Value> ToValue() override
	   {
			nodeTypeFactory fact;
		  	auto sptr = storage->data();
		  	const char* ptr = reinterpret_cast<const char*>(sptr + offset);
		  	auto s = fact.new_string(ptr, size);
		  	return s;
	   }

    private:
		size_t size;
		shared_ptr<DatumStorage::char_vec_t> storage;
		size_t offset = 0;
    };
}
