#include <js/workers/fetch_rows_worker.h>

#include <utils/Logger.h>
#include <common/odbc_common.h>
#include <js/js_object_mapper.h>
#include <odbc/odbc_row.h>
#include <platform.h>

namespace mssql {

FetchRowsWorker::FetchRowsWorker(Napi::Function& callback,
                                 IOdbcConnection* connection,
                                 const StatementHandle& statementHandle,
                                 const QueryOptions& options)
    : OdbcAsyncWorker(callback, connection), statementHandle_(statementHandle), options_(options) {
  SQL_LOG_DEBUG_STREAM(
      "FetchRowsWorker constructor for statement: " << statementHandle_.toString());
  result_ = std::make_shared<QueryResult>(statementHandle_);
}

void FetchRowsWorker::Execute() {
  try {
    SQL_LOG_DEBUG_STREAM(
        "Executing FetchRowsWorker for statement: " << statementHandle_.toString());

    if (!statementHandle_.isValid()) {
      SetError("Invalid statement handle");
      return;
    }

    const auto statement = GetStatement();
    if (!statement) {
      SetError("Statement not found");
      return;
    }
    statement->TryReadRows(result_, options_.batch_size);
  } catch (const std::exception& e) {
    SQL_LOG_ERROR("Exception in FetchRowsWorker::Execute: " + std::string(e.what()));
    SetError("Exception occurred: " + std::string(e.what()));
  } catch (...) {
    SQL_LOG_ERROR("Unknown exception in FetchRowsWorker::Execute");
    SetError("Unknown exception occurred");
  }
}

void FetchRowsWorker::OnOK() {
  const Napi::Env env = Env();
  Napi::HandleScope scope(env);
  SQL_LOG_DEBUG("FetchRowsWorker::OnOK");

  try {
    // Create a JavaScript array of rows
    /*
    Napi::Array rows = Napi::Array::New(env);
    const auto& statement = GetStatement();
    const auto& nativeData = statement->GetRows();
    const auto& columnDefs = *statement->GetMetaData();

    // Convert each row to a JavaScript object
    for (size_t i = 0; i < nativeData.size(); ++i) {
      const auto& row = nativeData[i];
      const auto jsRow = options_.as_objects
                             ? JsObjectMapper::fromOdbcRow(env, row, columnDefs)
                             : JsObjectMapper::fromOdbcRowAsArray(env, row, columnDefs);
      rows.Set(i, jsRow);
    }

    // Create a result object
    Napi::Object result = Napi::Object::New(env);
    result.Set("rows", rows);
    result.Set("endOfRows", Napi::Boolean::New(env, result_->is_end_of_rows()));
*/
    const auto resultset = GetStatement()->GetResultSet();
    const auto result = JsObjectMapper::fromQueryResult(env, resultset);
    // Call the callback with the result
    Callback().Call({env.Null(), result});
  } catch (const std::exception& e) {
    // Call the callback with an error
    Callback().Call({Napi::Error::New(env, e.what()).Value(), env.Null()});
  }
}
}  // namespace mssql