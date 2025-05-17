#pragma once
#include <napi.h>
#include <memory>
#include <functional>
#include <odbc/odbc_connection.h>
#include <odbc/odbc_error.h>
#include <utils/Logger.h>

namespace mssql {

// Forward declarations
class Connection;

/**
 * @brief Base class for all asynchronous workers
 *
 * This class provides common functionality for all worker implementations,
 * including error handling and success callbacks.
 */
template <typename ConnectionOp, typename SuccessCallback = std::function<void()>>
class ConnectionWorkerBase : public Napi::AsyncWorker {
 public:
  ConnectionWorkerBase(
      Napi::Function& callback,
      IOdbcConnection* connection,
      Connection* parent,
      ConnectionOp operation,
      SuccessCallback onSuccess = []() {})
      : AsyncWorker(callback),
        parent_(parent),
        connection_(connection),
        operation_(std::move(operation)),
        onSuccess_(std::move(onSuccess)) {}

  void Execute() override {
    SQL_LOG_DEBUG("Executing ConnectionWorker");

    try {
      result_ = operation_(connection_);

      if (!result_) {
        const auto& errors = connection_->GetErrors();
        if (!errors.empty()) {
          // Store all errors for later use in OnError
          errorDetails_ = errors;

          // Just use the first error message for the main error
          const std::string errorMessage = errors[0]->message;
          SQL_LOG_ERROR("Connection operation error: " + errorMessage);
          SetError(errorMessage);
        } else {
          SQL_LOG_ERROR("Unknown connection operation error");
          SetError("Unknown error occurred during operation");
        }
      } else {
        SQL_LOG_DEBUG("Connection worker completed successfully");
      }
    } catch (const std::exception& e) {
      SetError(e.what());
    } catch (...) {
      SetError("Unknown error occurred");
    }
  }

  void OnOK() override {
    const Napi::Env env = Env();
    Napi::HandleScope scope(env);

    // Call the success callback
    onSuccess_();  // This will update the connection state

    // Create a result object
    Napi::Object result = Napi::Object::New(env);
    result.Set("success", Napi::Boolean::New(env, result_));
    SQL_LOG_DEBUG("ConnectionWorkerBase::OnOK invoke cb");
    // Call the callback with null error and result
    Callback().Call({env.Null(), result});
  }

  // Add a new method to handle error details
  void OnError(const Napi::Error& error) override {
    const Napi::Env env = Env();
    Napi::HandleScope scope(env);

    // Create a detailed error object with ODBC specifics
    Napi::Object errorObj = Napi::Object::New(env);
    errorObj.Set("message", error.Message());

    if (!errorDetails_.empty()) {
      // Add SQLSTATE and native error code from the first error
      errorObj.Set("sqlState", Napi::String::New(env, errorDetails_[0]->sqlstate));
      errorObj.Set("code", Napi::Number::New(env, errorDetails_[0]->code));

      // Add all errors as an array of details
      Napi::Array details = Napi::Array::New(env);
      for (size_t i = 0; i < errorDetails_.size(); i++) {
        const auto& err = errorDetails_[i];
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

 protected:
  Connection* parent_;
  IOdbcConnection* connection_;
  ConnectionOp operation_;
  bool result_ = false;
  SuccessCallback onSuccess_;
  // Add this to store error details
  std::vector<std::shared_ptr<OdbcError>> errorDetails_;
};

/**
 * @brief Helper function to create a connection worker
 */
template <typename ConnectionOp, typename SuccessCallback = std::function<void()>>
auto MakeConnectionWorker(
    Napi::Function& callback,
    IOdbcConnection* connection,
    Connection* parent,
    ConnectionOp operation,
    SuccessCallback onSuccess = []() {}) {
  return new ConnectionWorkerBase<ConnectionOp, SuccessCallback>(
      callback, connection, parent, std::move(operation), std::move(onSuccess));
}

}  // namespace mssql