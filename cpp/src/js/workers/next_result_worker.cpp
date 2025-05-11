#include "common/platform.h"
#include "common/odbc_common.h"
#include "js/workers/next_result_worker.h"
#include "js_object_mapper.h"
#include "odbc_row.h"
#include "Logger.h"

namespace mssql
{
  NextResultWorker::NextResultWorker(Napi::Function &callback,
                                     IOdbcConnection *connection,
                                     const StatementHandle &statementHandle,
                                     size_t rowCount)
      : Napi::AsyncWorker(callback),
        connection_(connection),
        statementHandle_(statementHandle),
        rowCount_(rowCount)
  {
    SQL_LOG_DEBUG_STREAM("NextResultWorker constructor for statement: " << statementHandle_.toString());
    result_ = std::make_shared<QueryResult>(statementHandle_);
  }

  void NextResultWorker::Execute()
  {
    try
    {
      SQL_LOG_DEBUG_STREAM("Executing NextResult ");
      if (!connection_->TryReadNextResult(statementHandle_.getStatementId(), result_))
      {
        const auto &errors = connection_->GetErrors();
        if (!errors.empty())
        {
          const std::string errorMessage = errors[0]->message;
          SetError(errorMessage);
        }
        else
        {
          SetError("Unknown error occurred during query execution");
        }
      }
    }
    catch (const std::exception &e)
    {
      SQL_LOG_ERROR("Exception in QueryWorker::Execute: " + std::string(e.what()));
      SetError("Exception occurred: " + std::string(e.what()));
    }
    catch (...)
    {
      SQL_LOG_ERROR("Unknown exception in QueryWorker::Execute");
      SetError("Unknown exception occurred");
    }
  }

  void NextResultWorker::OnOK()
  {
    const Napi::Env env = Env();
    Napi::HandleScope scope(env);
    SQL_LOG_DEBUG("NextResultWorker::OnOK");
    // Validate that we have a callback function as the last argument

    try
    {
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
      Callback().Call({env.Null(), metadata});
    }
    catch (const std::exception &e)
    {
      // Call the callback with an error
      Callback().Call({Napi::Error::New(env, e.what()).Value(), env.Null()});
    }
  }

  void NextResultWorker::OnError(const Napi::Error &error)
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