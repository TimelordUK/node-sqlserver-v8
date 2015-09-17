
#pragma once

#include <memory>
#include <vector>
#include <v8.h>
#include "Column.h"

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

	   StringColumn(int size) : more(false)
	   {
		  text->resize(size);
	   }

	   StringColumn(unique_ptr<StringValue>& text, bool more) :
		  more(more)
	   {
		  swap(this->text, text);
	   }

	   Handle<Value> ToValue() override
	   {
		  nodeTypeFactory fact;
		  auto s = fact.fromTwoByte(static_cast<const uint16_t*>(text->data()), text->size());
		  return s;
	   }

	   bool More() const override
	   {
		  return more;
	   }

    private:

	   unique_ptr<StringValue> text;
	   bool more;
    };
}