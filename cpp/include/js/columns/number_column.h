
#pragma once
#include <napi.h>

#include <atomic>
#include <memory>
#include <mutex>
#include <string>
#include <js/columns/column.h>
#include <core/bound_datum_helper.h>

namespace mssql {

class NumberColumn : public Column {
 public:
  NumberColumn(int id, double d) : Column(id), value(d) {}

  NumberColumn(int id, shared_ptr<DatumStorageLegacy> storage)
      : Column(id), value((*storage->doublevec_ptr)[0]) {}

  // the same text as String(n) in JS: the shortest string that reads back as the same
  // double. to_wstring is %f, six decimal places and no exponent (1e-10 gave "0.000000", #498)
  inline Napi::Object ToString(Napi::Env env) override {
    return Napi::Number::New(env, value).ToString().As<Napi::Object>();
  }

  inline Napi::Object ToNative(Napi::Env env) override {
    return Napi::Number::New(env, value).As<Napi::Object>();
  }

 private:
  double value;
};
}  // namespace mssql
