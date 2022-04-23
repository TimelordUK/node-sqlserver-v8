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
		BinaryColumn(const int id, shared_ptr<DatumStorage> s, size_t l);
		BinaryColumn(const int id, shared_ptr<DatumStorage> s, size_t offset, size_t l);
		Local<Value> ToNative() override;
    Local<Value> ToString() override;

    private:
		shared_ptr<DatumStorage::char_vec_t> storage;
		size_t len;
		size_t offset;

    };
}
