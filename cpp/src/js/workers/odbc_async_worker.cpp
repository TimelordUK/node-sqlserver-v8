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

  Napi::Value errorArg;

  if (!errorDetails_.empty()) {
    // Return array of error objects
    Napi::Array details = Napi::Array::New(env);
    for (size_t i = 0; i < errorDetails_.size(); i++) {
      const auto& err = errorDetails_[i];
      const auto jsErrorObj = JsObjectMapper::fromOdbcError(env, *err);
      details.Set(i, jsErrorObj.Value());
    }
    errorArg = details;
  } else {
    // Single error case - use the Napi::Error
    errorArg = error.Value();
  }

  // Call the callback with the error(s) and null result
  Callback().Call({errorArg, env.Null(), Napi::Boolean::New(env, result_->is_end_of_rows())});
}
}  // namespace mssql