#pragma once

#include <functional>
#include <memory>
#include <odbc/odbc_driver_types.h>
#include <utils/Logger.h>

namespace mssql {

// Forward declaration of the enum
enum class OdbcStatementState;

// Interface for receiving state change notifications
class IOdbcStateNotifier {
 public:
  virtual ~IOdbcStateNotifier() = default;

  // Called when statement state changes
  virtual void OnStateChange(StatementHandle statementHandle,
                             OdbcStatementState oldState,
                             OdbcStatementState newState) = 0;
};

// Thread-safe notifier that can be passed between C++ threads
class OdbcStateNotifier : public IOdbcStateNotifier {
 public:
  using StateChangeCallback =
      std::function<void(StatementHandle, OdbcStatementState, OdbcStatementState)>;

  explicit OdbcStateNotifier(StateChangeCallback callback) : callback_(std::move(callback)) {}

  void OnStateChange(StatementHandle statementHandle,
                     OdbcStatementState oldState,
                     OdbcStatementState newState) override {
    if (callback_) {
      callback_(statementHandle, oldState, newState);
    }
  }

 private:
  StateChangeCallback callback_;
};

// Weak pointer holder for safe cross-thread access
class WeakStateNotifier {
 public:
  explicit WeakStateNotifier(std::weak_ptr<IOdbcStateNotifier> notifier)
      : notifier_(std::move(notifier)) {}

  void NotifyStateChange(StatementHandle statementHandle,
                         OdbcStatementState oldState,
                         OdbcStatementState newState) {
    if (auto strong = notifier_.lock()) {
      SQL_LOG_DEBUG_STREAM("WeakStateNotifier::NotifyStateChange [" << statementHandle.toString()
                                                                    << "] ");
      strong->OnStateChange(statementHandle, oldState, newState);
    } else {
      SQL_LOG_DEBUG_STREAM("WeakStateNotifier::NotifyStateChange [" << statementHandle.toString()
                                                                    << "] notifier is expired");
    }
  }

 private:
  std::weak_ptr<IOdbcStateNotifier> notifier_;
};

}  // namespace mssql