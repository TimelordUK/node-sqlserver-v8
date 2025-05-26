
#pragma once

#include <napi.h>

#include <atomic>
#include <memory>
#include <mutex>
#include <string>
#include <js/columns/column.h>
#include <core/bound_datum_helper.h>

namespace mssql {

class BigIntColumn : public Column {
 public:
  BigIntColumn(int id, DatumStorageLegacy::bigint_t d) : Column(id), value(d) {}

  BigIntColumn(int id, shared_ptr<DatumStorageLegacy> storage)
      : Column(id), value((*storage->bigint_vec_ptr)[0]) {}

  inline Napi::Object ToString(Napi::Env env) override {
    return AsString(env, value);
  }

  inline Napi::Object ToNative(Napi::Env env) override {
    return Napi::Number::New(env, value).As<Napi::Object>();
  }

 private:
  DatumStorageLegacy::bigint_t value;
};
}  // namespace mssql
