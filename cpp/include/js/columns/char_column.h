
#pragma once
#include <napi.h>

#include <atomic>
#include <memory>
#include <mutex>
#include <string>
#include <js/columns/column.h>
#include <core/bound_datum_helper.h>

namespace mssql {

class CharColumn : public Column {
 public:
  ~CharColumn() override {}

  CharColumn(int id, shared_ptr<DatumStorageLegacy> s, size_t size)
      : Column(id), size(size), storage(s->charvec_ptr) {}

  CharColumn(int id, shared_ptr<DatumStorageLegacy::char_vec_t> s, size_t size)
      : Column(id), size(size), storage(s) {}

  CharColumn(int id, shared_ptr<DatumStorageLegacy::char_vec_t> s, size_t offset, size_t size)
      : Column(id), size(size), storage(s), offset(offset) {}

  inline Napi::Object ToString(Napi::Env env) override {
    return ToValue(env);
  }

  inline Napi::Object ToNative(Napi::Env env) override {
    auto sptr = storage->data();
    auto s = Napi::String::New(env, sptr + offset, size);
    return s.As<Napi::Object>();
  }

 private:
  size_t size;
  shared_ptr<DatumStorageLegacy::char_vec_t> storage;
  size_t offset = 0;
};
}  // namespace mssql
