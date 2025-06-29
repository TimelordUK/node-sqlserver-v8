#include <js/workers/prepare_worker.h>

#include <utils/Logger.h>
#include <js/js_object_mapper.h>
#include <common/odbc_common.h>
#include <core/bound_datum_set.h>
#include <platform.h>
#include <common/string_utils.h>

namespace mssql {

PrepareWorker::PrepareWorker(Napi::Function& callback,
                             IOdbcConnection* connection,
                             const std::shared_ptr<QueryOperationParams> q,
                             const Napi::Array& params,
                             Napi::Function stateChangeCallback)
    : OdbcAsyncWorker(callback, connection), queryParams_(q) {
  // Create state notifier if callback is provided
  if (!stateChangeCallback.IsEmpty()) {
    stateNotifier_ = std::make_shared<JsStateNotifier>(Env(), stateChangeCallback);
  }
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
}

void PrepareWorker::Execute() {
  if (has_error_) {
    SQL_LOG_ERROR_STREAM("Error in PrepareWorker::Execute: ");
    return;
  }

  try {
    // SQL_LOG_DEBUG_STREAM("Executing QueryWorker " << StringUtils::U16StringToUtf8(sqlText_));
    // This will need to be implemented in OdbcConnection
    // Here's a placeholder showing what it might look like
    if (!connection_->PrepareQuery(queryParams_, parameters_, result_, stateNotifier_)) {
      const auto& errors = connection_->GetErrors();
      if (!errors.empty()) {
        // Populate errorDetails_ with all ODBC errors
        errorDetails_ = errors;
        const std::string errorMessage = errors[0]->message;
        SetError(errorMessage);
        has_error_ = true;
      } else {
        SetError("Unknown error occurred during PrepareWorker execution");
      }
    }
  } catch (const std::exception& e) {
    SQL_LOG_ERROR("Exception in PrepareWorker::Execute: " + std::string(e.what()));
    SetError("Exception occurred: " + std::string(e.what()));
  } catch (...) {
    SQL_LOG_ERROR("Unknown exception in PrepareWorker::Execute");
    SetError("Unknown exception occurred");
  }
}

void PrepareWorker::OnOK() {
  if (has_error_) {
    SQL_LOG_ERROR_STREAM("Error in PrepareWorker::OnOK: ");
    return;
  }

  const Napi::Env env = Env();
  Napi::HandleScope scope(env);
  SQL_LOG_DEBUG("PrepareWorker::OnOK");

  try {
    const auto metadata = GetMetadata();
    Callback().Call({env.Null(), metadata});
  } catch (const std::exception& e) {
    // Call the callback with an error
    Callback().Call({Napi::Error::New(env, e.what()).Value(), env.Null()});
  }
}

}  // namespace mssql