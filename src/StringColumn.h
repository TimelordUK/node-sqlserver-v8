
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
		  for (int i = 0, j = 0; i < len * 2; i += 2, j++) {
				c_str[j] = ptr[i];
		  }	
		  c_str.resize(len - 1);
		  auto s = fact.new_string(c_str.data());
		  // auto s = MutateJS::from_two_byte(static_cast<const uint16_t*>(ptr + offset), len);
		  return s;
	   }

    private:
		size_t size;
		shared_ptr<DatumStorage::uint16_t_vec_t> storage;
		size_t offset = 0;
    };
}
