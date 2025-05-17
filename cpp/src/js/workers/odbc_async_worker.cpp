#include "workers/odbc_async_worker.h"

#include "Logger.h"
#include "js_object_mapper.h"

namespace mssql {
Napi::Object OdbcAsyncWorker::GetMetadata() {
  const Napi::Env env = Env();

  SQL_LOG_DEBUG("OdbcAsyncWorker::GetMetadata");
  Napi::Object metadata = JsObjectMapper::fromNativeQueryResult(env, result_);

  return metadata;
}

void OdbcAsyncWorker::OnError(const Napi::Error& error) {
  const Napi::Env env = Env();
  Napi::HandleScope scope(env);

  // Create a detailed error object with ODBC specifics
  Napi::Object errorObj = Napi::Object::New(env);
  errorObj.Set("message", error.Message());

  if (!errorDetails_.empty()) {
    // Add SQLSTATE and native error code from the first error
    errorObj.Set("sqlState", Napi::String::New(env, errorDetails_[0]->sqlstate));
    errorObj.Set("code", Napi::Number::New(env, errorDetails_[0]->code));

    // Add all errors as an array of details
    Napi::Array details = Napi::Array::New(env);
    for (size_t i = 0; i < errorDetails_.size(); i++) {
      const auto& err = errorDetails_[i];
      Napi::Object detail = JsObjectMapper::fromOdbcError(env, *err);
      details.Set(i, detail);
    }
    errorObj.Set("details", details);
  }

  // Call the callback with the enhanced error object and null result
  Callback().Call({errorObj, env.Null()});
}
}  // namespace mssql