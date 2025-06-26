
#pragma once

#include <napi.h>

#include <atomic>
#include <memory>
#include <mutex>
#include <string>
#include <js/columns/column.h>
#include <core/bound_datum_helper.h>

namespace mssql {

class StringColumn : public Column {
 public:
  ~StringColumn() override {}

  StringColumn(int id, shared_ptr<DatumStorageLegacy> s, size_t size)
      : Column(id), size(size), storage(s->uint16vec_ptr) {}

  StringColumn(int id, shared_ptr<DatumStorageLegacy::uint16_t_vec_t> s, size_t size)
      : Column(id), size(size), storage(s) {}

  StringColumn(int id, shared_ptr<DatumStorageLegacy::uint16_t_vec_t> s, size_t offset, size_t size)
      : Column(id), size(size), storage(s), offset(offset) {}

  inline Napi::Object ToString(Napi::Env env) override {
    return ToValue(env);
  }

  inline Napi::Object ToNative(Napi::Env env) override {
    auto sptr = storage->data() + offset;
    // size is already in UTF-16 code units (not bytes)
    return Napi::String::New(env, reinterpret_cast<const char16_t*>(sptr), size).As<Napi::Object>();
  }

 private:
  size_t size;
  shared_ptr<DatumStorageLegacy::uint16_t_vec_t> storage;
  size_t offset = 0;
};

}  // namespace mssql
