#pragma once
#include <napi.h>

#include <atomic>
#include <memory>
#include <mutex>
#include <string>
#include <js/columns/column.h>
#include <core/bound_datum_helper.h>

namespace mssql {

class NullColumn : public Column {
 public:
  NullColumn(int id) : Column(id) {}

  inline Napi::Object ToString(Napi::Env env) override {
    return env.Null().As<Napi::Object>();
  }

  inline Napi::Object ToNative(Napi::Env env) override {
    return env.Null().As<Napi::Object>();
  }

 private:
};

}  // namespace mssql
