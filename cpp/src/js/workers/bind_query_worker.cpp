#include <js/workers/bind_query_worker.h>

#include <utils/Logger.h>
#include <js/js_object_mapper.h>
#include <common/odbc_common.h>
#include <core/bound_datum_set.h>
#include <platform.h>
#include <common/string_utils.h>

namespace mssql {

BindQueryWorker::BindQueryWorker(Napi::Function& callback,
                                 IOdbcConnection* connection,
                                 const int queryId,
                                 const Napi::Array& params)
    : OdbcAsyncWorker(callback, connection), queryId_(queryId) {
  // Convert JavaScript parameters to C++ parameters
  const uint32_t length = params.Length();

  // Or use it somewhere, perhaps in a logging statement:
  SQL_LOG_DEBUG_STREAM("Processing " << length << " parameters");
  parameters_ = std::make_shared<BoundDatumSet>();
  // ParameterFactory::populateParameterSet(params, parameters_);
  if (!parameters_->bind(params)) {
    SQL_LOG_ERROR_STREAM("Failed to bind parameters: " << parameters_->err);

    // Format error message to match legacy driver format
    std::string formatted_error = "IMNOD: [msnodesql] Parameter " +
                                  std::to_string(parameters_->first_error + 1) + ": " +
                                  parameters_->err;
    SetError(formatted_error);
    has_error_ = true;
  }

  result_ = std::make_shared<QueryResult>();
  if (has_error_) {
    result_->set_end_of_results(true);
    result_->set_end_of_rows(true);
  }
}

void BindQueryWorker::Execute() {
  if (has_error_) {
    SQL_LOG_ERROR_STREAM("Error in BindQueryWorker::Execute: ");
    return;
  }

  try {
    // SQL_LOG_DEBUG_STREAM("Executing QueryWorker " << StringUtils::U16StringToUtf8(sqlText_));
    // This will need to be implemented in OdbcConnection
    // Here's a placeholder showing what it might look like
    if (!connection_->BindQuery(queryId_, parameters_, result_)) {
      const auto& errors = connection_->GetErrors();
      if (!errors.empty()) {
        // Populate errorDetails_ with all ODBC errors
        errorDetails_ = errors;
        const std::string errorMessage = errors[0]->message;
        SetError(errorMessage);
        has_error_ = true;
      }
    }
  } catch (const std::exception& e) {
    SQL_LOG_ERROR("Exception in BindQueryWorker::Execute: " + std::string(e.what()));
    SetError("Exception occurred: " + std::string(e.what()));
  } catch (...) {
    SQL_LOG_ERROR("Unknown exception in BindQueryWorker::Execute");
    SetError("Unknown exception occurred");
  }
}

void BindQueryWorker::OnOK() {
  if (has_error_) {
    SQL_LOG_ERROR_STREAM("Error in BindQueryWorker::OnOK: ");
    return;
  }

  const Napi::Env env = Env();
  Napi::HandleScope scope(env);
  SQL_LOG_DEBUG("BindQueryWorker::OnOK");

  try {
    const auto metadata = GetMetadata();
    Callback().Call({env.Null(), metadata});
  } catch (const std::exception& e) {
    // Call the callback with an error
    Callback().Call({Napi::Error::New(env, e.what()).Value(), env.Null()});
  }
}

}  // namespace mssql