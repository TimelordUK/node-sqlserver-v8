#include "stdafx.h"
#include "Connection.h"

void InitAll(v8::Local<v8::Object> exports) {
  mssql::Connection::Init(exports);
}

NAN_MODULE_WORKER_ENABLED(addon, InitAll)