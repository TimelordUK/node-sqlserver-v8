#include <platform.h>
#include <js/columns/column.h>
#include <js/columns/binary_column.h>

namespace mssql {
BinaryColumn::BinaryColumn(const int id, shared_ptr<DatumStorageLegacy> s, size_t l)
    : Column(id), storage(s->charvec_ptr), len(l), offset(0) {}

BinaryColumn::BinaryColumn(const int id, shared_ptr<DatumStorageLegacy> s, size_t offset, size_t l)
    : Column(id), storage(s->charvec_ptr), len(l), offset(offset) {}

Napi::Object BinaryColumn::ToString(Napi::Env env) {
  const auto* const ptr = storage->data() + offset;
  const std::string s(ptr, ptr + len);
  storage->reserve(0);
  storage = nullptr;
  // Convert binary data to hex string representation
  std::string hex;
  hex.reserve(len * 2);
  for (size_t i = 0; i < len; ++i) {
    char buf[3];
    snprintf(buf, sizeof(buf), "%02X", static_cast<unsigned char>(s[i]));
    hex += buf;
  }
  return Napi::String::New(env, hex).As<Napi::Object>();
}

Napi::Object BinaryColumn::ToNative(Napi::Env env) {
  const auto* const ptr = storage->data() + offset;
  // Create a copy of the binary data in a Buffer
  auto buff = Napi::Buffer<char>::Copy(env, ptr, len);
  storage->reserve(0);
  storage = nullptr;
  // fprintf(stderr, "[%d], ToValue len = %zu, offset = %zu, ptr = %p, destructed = %d\n", Id(),
  // len, offset, str, destructed);
  return buff.As<Napi::Object>();
}
}  // namespace mssql