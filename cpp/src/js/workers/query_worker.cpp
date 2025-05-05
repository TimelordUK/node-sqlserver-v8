#include "platform.h"
#include "odbc_common.h"
#include "workers/query_worker.h"
#include "parameter_set.h"
#include "js_object_mapper.h"
#include "Logger.h"

namespace mssql
{

  QueryWorker::QueryWorker(Napi::Function &callback,
                           IOdbcConnection *connection,
                           const std::string &sqlText,
                           const Napi::Array &params)
      : Napi::AsyncWorker(callback),
        connection_(connection),
        sqlText_(sqlText)
  {
    // Convert JavaScript parameters to C++ parameters
    const uint32_t length = params.Length();

    // Or use it somewhere, perhaps in a logging statement:
    SQL_LOG_DEBUG_STREAM("Processing " << length << " parameters");
    parameters_ = std::make_shared<ParameterSet>();
    // ParameterFactory::populateParameterSet(params, parameters_);

    result_ = std::make_shared<QueryResult>();
  }

  void QueryWorker::Execute()
  {
    try
    {
      SQL_LOG_DEBUG_STREAM("Executing QueryWorker " << sqlText_);
      // This will need to be implemented in OdbcConnection
      // Here's a placeholder showing what it might look like
      if (!connection_->ExecuteQuery(sqlText_, parameters_->getParams(), result_))
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

  void QueryWorker::OnOK()
  {
    const Napi::Env env = Env();
    Napi::HandleScope scope(env);
    SQL_LOG_DEBUG("QueryWorker::OnOK");
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
      Callback().Call({env.Null(), metadata});
    }
    catch (const std::exception &e)
    {
      // Call the callback with an error
      Callback().Call({Napi::Error::New(env, e.what()).Value(), env.Null()});
    }
  }

} // namespace mssql