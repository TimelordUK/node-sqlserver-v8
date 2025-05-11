#include "workers/odbc_async_worker.h"
#include "js_object_mapper.h"
#include "Logger.h"

namespace mssql
{
    Napi::Object OdbcAsyncWorker::GetMetadata()
    {
        const Napi::Env env = Env();
        Napi::HandleScope scope(env);
        SQL_LOG_DEBUG("OdbcAsyncWorker::GetMetadata");
        // Create a JavaScript array of column definitions
        Napi::Array columns = Napi::Array::New(env);

        // Populate the array with column metadata
        for (size_t i = 0; i < result_->size(); i++)
        {
            ColumnDefinition colDef = result_->get(i);
            columns[i] = JsObjectMapper::fromColumnDefinition(env, colDef);
        }

        // Create a metadata object to return
        Napi::Object metadata = Napi::Object::New(env);
        Napi::Object handle = JsObjectMapper::fromStatementHandle(env, result_->getHandle());
        metadata.Set("meta", columns);
        metadata.Set("handle", handle);
        metadata.Set("endOfRows", Napi::Boolean::New(env, result_->is_end_of_rows()));
        metadata.Set("endOfResults", Napi::Boolean::New(env, result_->is_end_of_results()));
        return metadata_;
    }

    void OdbcAsyncWorker::OnError(const Napi::Error &error)
    {
        const Napi::Env env = Env();
        Napi::HandleScope scope(env);

        // Create a detailed error object with ODBC specifics
        Napi::Object errorObj = Napi::Object::New(env);
        errorObj.Set("message", error.Message());

        if (!errorDetails_.empty())
        {
            // Add SQLSTATE and native error code from the first error
            errorObj.Set("sqlState", Napi::String::New(env, errorDetails_[0]->sqlstate));
            errorObj.Set("code", Napi::Number::New(env, errorDetails_[0]->code));

            // Add all errors as an array of details
            Napi::Array details = Napi::Array::New(env);
            for (size_t i = 0; i < errorDetails_.size(); i++)
            {
                const auto &err = errorDetails_[i];
                Napi::Object detail = Napi::Object::New(env);
                detail.Set("sqlState", Napi::String::New(env, err->sqlstate));
                detail.Set("message", Napi::String::New(env, err->message));
                detail.Set("code", Napi::Number::New(env, err->code));
                details.Set(i, detail);
            }
            errorObj.Set("details", details);
        }

        // Call the callback with the enhanced error object and null result
        Callback().Call({errorObj, env.Null()});
    }
} // namespace mssql