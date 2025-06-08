#pragma once

#include <functional>
#include <memory>

namespace mssql {

// Forward declaration of the enum
enum class OdbcStatementState;

// Interface for receiving state change notifications
class IOdbcStateNotifier {
 public:
  virtual ~IOdbcStateNotifier() = default;
  
  // Called when statement state changes
  virtual void OnStateChange(int statementId, 
                            OdbcStatementState oldState, 
                            OdbcStatementState newState) = 0;
};

// Thread-safe notifier that can be passed between C++ threads
class OdbcStateNotifier : public IOdbcStateNotifier {
 public:
  using StateChangeCallback = std::function<void(int, OdbcStatementState, OdbcStatementState)>;
  
  explicit OdbcStateNotifier(StateChangeCallback callback) 
    : callback_(std::move(callback)) {}
  
  void OnStateChange(int statementId, 
                    OdbcStatementState oldState, 
                    OdbcStatementState newState) override {
    if (callback_) {
      callback_(statementId, oldState, newState);
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
  
  void NotifyStateChange(int statementId, 
                        OdbcStatementState oldState, 
                        OdbcStatementState newState) {
    if (auto strong = notifier_.lock()) {
      strong->OnStateChange(statementId, oldState, newState);
    }
  }
  
 private:
  std::weak_ptr<IOdbcStateNotifier> notifier_;
};

}  // namespace mssql