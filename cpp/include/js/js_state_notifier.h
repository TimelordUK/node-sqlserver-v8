#pragma once

#include <napi.h>
#include <memory>
#include <mutex>
#include <js/js_object_mapper.h>
#include <odbc/odbc_state_notifier.h>
#include <odbc/odbc_statement.h>  // For OdbcStatementStateToString

namespace mssql {

// JavaScript state notifier that can callback to JS from any thread
class JsStateNotifier : public IOdbcStateNotifier {
 public:
  JsStateNotifier(Napi::Env env, Napi::Function callback)
      : env_(env),
        callback_(Napi::ThreadSafeFunction::New(env,
                                                callback,
                                                "StateNotifier",
                                                0,  // Unlimited queue
                                                1   // One thread
                                                )) {}

  ~JsStateNotifier() {
    // Release the thread-safe function
    callback_.Release();
  }

  void OnStateChange(StatementHandle statementHandle,
                     OdbcStatementState oldState,
                     OdbcStatementState newState) override {
    // This can be called from any thread, so we use ThreadSafeFunction
    auto callback = [statementHandle, oldState, newState](Napi::Env env,
                                                          Napi::Function jsCallback) {
      const auto stateChange = StatementStateChange(statementHandle,
                                                    OdbcStatementStateToString(oldState),
                                                    OdbcStatementStateToString(newState));
      jsCallback.Call({env.Null(), JsObjectMapper::fromStatementStateChange(env, stateChange)});
    };

    // Queue the callback to be executed on the main thread
    callback_.BlockingCall(callback);
  }

 private:
  Napi::Env env_;
  Napi::ThreadSafeFunction callback_;
};

}  // namespace mssql