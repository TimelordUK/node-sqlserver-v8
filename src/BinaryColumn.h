#pragma once

#include <vector>
#include <v8.h>
#include "Column.h"
#include <node_buffer.h>
#include "BoundDatumHelper.h"

namespace mssql
{
    using namespace std;

    class BinaryColumn : public Column
    {
    public:

	   BinaryColumn(shared_ptr<DatumStorage::char_vec_t> src, bool more)
		  : more(more)
	   {
		  d = bufferPoolChar_t::accept(src);
	   }

	   Handle<Value> ToValue() override
	   {
		   return node::Buffer::New(Isolate::GetCurrent(), d.p->data(), d.p->size(), deleteBuffer, &d.id)
#ifdef NODE_GYP_V4 
			   .ToLocalChecked()
#endif
			   ;
	   }

	   bool More() const override
	   {
		  return more;
	   }

	   static void deleteBuffer(char* ptr, void* hint)
	   {
		  int id = *static_cast<int*>(hint);
		  bufferPoolChar_t::remove(id);
	   }

    private:
	   bufferPoolChar_t::def d;
	   bool more;
    };
}
