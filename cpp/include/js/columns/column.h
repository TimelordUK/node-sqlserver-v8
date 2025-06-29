
#pragma once

#pragma once
#include <napi.h>

#include <atomic>
#include <memory>
#include <mutex>
#include <string>

namespace mssql {

class Column {
 public:
  Column(int id) : _id(id), _asNative(true) {}
  virtual ~Column();

  virtual Napi::Object ToNative(Napi::Env env) = 0;
  virtual Napi::Object ToValue(Napi::Env env) {
    return _asNative ? ToNative(env) : ToString(env);
  }

  virtual Napi::Object ToString(Napi::Env env) = 0;

  int Id() const {
    return _id;
  }
  void AsString() {
    _asNative = false;
  }

  template <class T>
  Napi::Object AsString(Napi::Env env, T value) {
    std::wstring wstr = std::to_wstring(value);
    std::u16string str(wstr.begin(), wstr.end());
    return Napi::String::New(env, str).As<Napi::Object>();
  }

 private:
  int _id;
  bool _asNative;
};
}  // namespace mssql
