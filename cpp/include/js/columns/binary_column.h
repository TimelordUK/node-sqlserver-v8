
#pragma once

#include <napi.h>

#include <atomic>
#include <memory>
#include <mutex>
#include <string>
#include <js/columns/column.h>
#include <core/bound_datum_helper.h>

namespace mssql {

class BinaryColumn : public Column {
 public:
  BinaryColumn(const int id, shared_ptr<DatumStorageLegacy> s, size_t l);
  BinaryColumn(const int id, shared_ptr<DatumStorageLegacy> s, size_t offset, size_t l);
  Napi::Object ToNative(Napi::Env env) override;
  Napi::Object ToString(Napi::Env env) override;

 private:
  shared_ptr<DatumStorageLegacy::char_vec_t> storage;
  size_t len;
  size_t offset;
};
}  // namespace mssql
