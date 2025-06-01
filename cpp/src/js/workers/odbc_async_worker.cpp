#include <js/workers/odbc_async_worker.h>

#include <utils/Logger.h>
#include <js/js_object_mapper.h>

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

  // Create a JavaScript Error object (not just a plain object)
  Napi::Error jsError = Napi::Error::New(env, error.Message());

  if (!errorDetails_.empty()) {
    const auto& firstError = errorDetails_[0];
    // Add ODBC-specific properties to the Error object
    jsError.Set("sqlstate", Napi::String::New(env, firstError->sqlstate));
    jsError.Set("code", Napi::Number::New(env, firstError->code));
    jsError.Set("severity", Napi::Number::New(env, firstError->severity));
    jsError.Set("serverName", Napi::String::New(env, firstError->serverName));
    jsError.Set("procName", Napi::String::New(env, firstError->procName));
    jsError.Set("lineNumber", Napi::Number::New(env, firstError->lineNumber));

    // Add all errors as an array of details
    Napi::Array details = Napi::Array::New(env);
    for (size_t i = 0; i < errorDetails_.size(); i++) {
      const auto& err = errorDetails_[i];
      Napi::Object detail = JsObjectMapper::fromOdbcError(env, *err);
      details.Set(i, detail);
    }
    jsError.Set("details", details);
  }

  // Call the callback with the Error object and null result
  Callback().Call({jsError.Value(), env.Null()});
}
}  // namespace mssql