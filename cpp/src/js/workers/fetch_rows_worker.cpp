#include "platform.h"
#include "odbc_common.h"
#include "workers/fetch_rows_worker.h"
#include "js_object_mapper.h"
#include "Logger.h"

namespace mssql
{

  FetchRowsWorker::FetchRowsWorker(Napi::Function &callback,
                                   IOdbcConnection *connection,
                                   const StatementHandle &statementHandle,
                                   size_t rowCount)
      : Napi::AsyncWorker(callback),
        connection_(connection),
        statementHandle_(statementHandle),
        rowCount_(rowCount)
  {
    SQL_LOG_DEBUG_STREAM("FetchRowsWorker constructor for statement: " << statementHandle_.toString());
    result_ = std::make_shared<QueryResult>(statementHandle_);
  }

  void FetchRowsWorker::Execute()
  {
    try
    {
      SQL_LOG_DEBUG_STREAM("Executing FetchRowsWorker for statement: " << statementHandle_.toString());

      if (!statementHandle_.isValid())
      {
        SetError("Invalid statement handle");
        return;
      }

      // This is a stub implementation for now
      // In a real implementation, we would:
      // 1. Get the statement from a statement cache
      // 2. Call methods to fetch rows
      // 3. Process the result set

      // For now, just set endOfRows_ to true to simulate end of result set
      endOfRows_ = true;
    }
    catch (const std::exception &e)
    {
      SQL_LOG_ERROR("Exception in FetchRowsWorker::Execute: " + std::string(e.what()));
      SetError("Exception occurred: " + std::string(e.what()));
    }
    catch (...)
    {
      SQL_LOG_ERROR("Unknown exception in FetchRowsWorker::Execute");
      SetError("Unknown exception occurred");
    }
  }

  void FetchRowsWorker::OnOK()
  {
    const Napi::Env env = Env();
    Napi::HandleScope scope(env);
    SQL_LOG_DEBUG("FetchRowsWorker::OnOK");

    try
    {
      // Create a JavaScript array of rows
      Napi::Array rows = Napi::Array::New(env);

      // For now, this is just a stub implementation that returns an empty array

      // Create a result object
      Napi::Object result = Napi::Object::New(env);
      result.Set("rows", rows);
      result.Set("endOfRows", Napi::Boolean::New(env, endOfRows_));

      // Call the callback with the result
      Callback().Call({env.Null(), result});
    }
    catch (const std::exception &e)
    {
      // Call the callback with an error
      Callback().Call({Napi::Error::New(env, e.what()).Value(), env.Null()});
    }
  }

  void FetchRowsWorker::OnError(const Napi::Error &error)
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