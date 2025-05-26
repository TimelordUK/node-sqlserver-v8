#include <js/workers/query_worker.h>

#include <utils/Logger.h>
#include <js/js_object_mapper.h>
#include <common/odbc_common.h>
#include <core/bound_datum_set.h>
#include <platform.h>
#include <common/string_utils.h>

namespace mssql {

QueryWorker::QueryWorker(Napi::Function& callback,
                         IOdbcConnection* connection,
                         const std::u16string& sqlText,
                         const Napi::Array& params)
    : OdbcAsyncWorker(callback, connection), sqlText_(sqlText) {
  // Convert JavaScript parameters to C++ parameters
  const uint32_t length = params.Length();

  // Or use it somewhere, perhaps in a logging statement:
  SQL_LOG_DEBUG_STREAM("Processing " << length << " parameters");
  parameters_ = std::make_shared<BoundDatumSet>();
  // ParameterFactory::populateParameterSet(params, parameters_);
  parameters_->bind(params);

  /*
    for (uint32_t i = 0; i < length; i++) {
      Napi::Value param = params[i];
      if (param.IsObject()) {
        const Napi::Object jsParam = param.As<Napi::Object>();
        const std::shared_ptr<SqlParameter> sqlParam = JsObjectMapper::toSqlParameter(jsParam);
        parameters_->add(sqlParam);
      }
    }
  */

  result_ = std::make_shared<QueryResult>();
}

void QueryWorker::Execute() {
  try {
    SQL_LOG_DEBUG_STREAM("Executing QueryWorker " << StringUtils::U16StringToUtf8(sqlText_));
    // This will need to be implemented in OdbcConnection
    // Here's a placeholder showing what it might look like
    if (!connection_->ExecuteQuery(sqlText_, parameters_, result_)) {
      const auto& errors = connection_->GetErrors();
      if (!errors.empty()) {
        const std::string errorMessage = errors[0]->message;
        SetError(errorMessage);
      } else {
        SetError("Unknown error occurred during query execution");
      }
    }
  } catch (const std::exception& e) {
    SQL_LOG_ERROR("Exception in QueryWorker::Execute: " + std::string(e.what()));
    SetError("Exception occurred: " + std::string(e.what()));
  } catch (...) {
    SQL_LOG_ERROR("Unknown exception in QueryWorker::Execute");
    SetError("Unknown exception occurred");
  }
}

void QueryWorker::OnOK() {
  const Napi::Env env = Env();
  Napi::HandleScope scope(env);
  SQL_LOG_DEBUG("QueryWorker::OnOK");

  try {
    const auto metadata = GetMetadata();
    Callback().Call({env.Null(), metadata});
  } catch (const std::exception& e) {
    // Call the callback with an error
    Callback().Call({Napi::Error::New(env, e.what()).Value(), env.Null()});
  }
}

}  // namespace mssql