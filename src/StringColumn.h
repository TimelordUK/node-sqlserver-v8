
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

	   typedef vector<uint16_t> StringValue;

	   StringColumn(shared_ptr<DatumStorage> s, size_t size) : more(false), size(size), storage(s)
	   {
	   }

	   StringColumn(shared_ptr<DatumStorage> s, size_t size, bool more) : more(more), size(size), storage(s)
	   {
	   }

	   StringColumn(int size) : more(false), storage(nullptr)
	   {
		  text->resize(size);
	   }

	   StringColumn(unique_ptr<StringValue>& text, bool more) :
		  more(more), storage(nullptr)
	   {
		  swap(this->text, text);
	   }

	   Handle<Value> ToValue() override
	   {
		  nodeTypeFactory fact;
		  auto ptr = storage != nullptr ? storage->uint16vec_ptr->data() : text->data();
		  auto len = storage != nullptr ? size : text->size();
		  auto s = fact.fromTwoByte(static_cast<const uint16_t*>(ptr), len);
		  return s;
	   }

	   bool More() const override
	   {
		  return more;
	   }

    private:

	   unique_ptr<StringValue> text;
	   shared_ptr<DatumStorage> storage;
	   size_t size;
	   bool more;
    };
}