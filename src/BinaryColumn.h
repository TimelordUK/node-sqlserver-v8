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
		BinaryColumn(shared_ptr<DatumStorage> storage, size_t l, bool more)
			: len(l), raw(clone(storage->charvec_ptr, l)), more(more)
		{
		}

	   Handle<Value> ToValue() override
	   {
		   return node::Buffer::New(Isolate::GetCurrent(), raw, len, deleteBuffer, raw)
#ifdef NODE_GYP_V4 
			   .ToLocalChecked()
#endif
			   ;
	   }

	   bool More() const override
	   {
		  return more;
	   }

    private:

		static char *clone(shared_ptr<DatumStorage::char_vec_t> sp, size_t len)
		{
			char *dest = new char[len];
			memcpy(dest, sp->data(), len);
			return dest;
		}

		static void deleteBuffer(char* ptr, void* hint)
		{
			//fprintf(stderr, "delete ptr %p\n", hint);
			delete[] hint;
		}

		size_t len;
		char *raw;
	    bool more;
    };
}
