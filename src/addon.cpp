#include <nan.h>
#include "Connection.h"

void InitAll(v8::Local<v8::Object> exports) {
  mssql::Connection::Init(exports);
}

NODE_MODULE(addon, InitAll)