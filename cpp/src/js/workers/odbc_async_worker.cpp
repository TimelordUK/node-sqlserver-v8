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

Napi::Value OdbcAsyncWorker::GetErrors(const Napi::Env env) {
  Napi::Array details = Napi::Array::New(env);
  for (size_t i = 0; i < errorDetails_.size(); i++) {
    const auto& err = errorDetails_[i];
    const auto jsErrorObj = JsObjectMapper::fromOdbcError(env, *err);
    details.Set(i, jsErrorObj.Value());
  }
  return details;
}

void OdbcAsyncWorker::OnError(const Napi::Error& error) {
  const Napi::Env env = Env();
  Napi::HandleScope scope(env);

  Napi::Value errorArg = errorDetails_.empty() ? error.Value() : GetErrors(env);

  const auto meta = GetMetadata();
  // Call the callback with the error(s) and null result
  Callback().Call({errorArg, meta, Napi::Boolean::New(env, !result_->is_end_of_results())});
}
}  // namespace mssql