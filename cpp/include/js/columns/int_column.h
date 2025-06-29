
#pragma once
#include <napi.h>

#include <atomic>
#include <memory>
#include <mutex>
#include <string>
#include <js/columns/column.h>
#include <core/bound_datum_helper.h>

namespace mssql {

class IntColumn : public Column {
 public:
  IntColumn(int id, shared_ptr<DatumStorageLegacy> storage)
      : Column(id), value((*storage->int64vec_ptr)[0]) {}

  IntColumn(int id, long v) : Column(id), value(v) {}

  inline Napi::Object ToString(Napi::Env env) override {
    return AsString(env, value);
  }

  inline Napi::Object ToNative(Napi::Env env) override {
    return Napi::Number::New(env, value).As<Napi::Object>();
  }

 private:
  int64_t value;
};
}  // namespace mssql
