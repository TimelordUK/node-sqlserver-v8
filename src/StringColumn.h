
#pragma once

#include <memory>
#include <vector>
#include <v8.h>
#include "Column.h"
#include "BoundDatumHelper.h"

namespace mssql
{
    using namespace std;

    class StringColumn : public Column
    {
    public:
	   virtual ~StringColumn()
	   {
	   }

	   StringColumn(int id, shared_ptr<DatumStorage> s, size_t size) : Column(id), more(false), size(size), storage(s)
	   {
	   }

	   StringColumn(int id, shared_ptr<DatumStorage> s, size_t size, bool more) : Column(id), more(more), size(size), storage(s)
	   {
	   }

	   StringColumn(int id, int size) : Column(id), more(false), storage(nullptr)
	   {
		   storage->uint16vec_ptr->resize(size);
	   }

	   Handle<Value> ToValue() override
	   {
		  nodeTypeFactory fact;
		  auto ptr = storage->uint16vec_ptr->data();
		  auto len = size;
		  auto s = fact.from_two_byte(static_cast<const uint16_t*>(ptr), len);
		  return s;
	   }

	   bool More() const override
	   {
		  return more;
	   }

    private:

	   shared_ptr<DatumStorage> storage;
	   size_t size;
	   bool more;
    };
}