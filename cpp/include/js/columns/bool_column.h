
#pragma once

#include <napi.h>

#include <atomic>
#include <memory>
#include <mutex>
#include <string>
#include <js/columns/column.h>
#include <core/bound_datum_helper.h>

namespace mssql {

class BoolColumn : public Column {
 public:
  BoolColumn(int id, shared_ptr<DatumStorageLegacy> storage)
      : Column(id), value((*storage->charvec_ptr)[0] != 0 ? true : false) {}

  BoolColumn(int id, char v) : Column(id), value(v != 0 ? true : false) {}

  inline Napi::Object ToString(Napi::Env env) override {
    return AsString(env, value);
  }

  inline Napi::Object ToNative(Napi::Env env) override {
    return Napi::Boolean::New(env, value).As<Napi::Object>();
  }

 private:
  bool value;
};

}  // namespace mssql
