#pragma once

#include <atomic>
#include <memory>
#include <mutex>
#include <string>
#include "odbc_handles.h"
#include "Logger.h"

namespace mssql {

/**
 * @brief Thread-safe wrapper for ODBC handles to prevent double-free and invalid access
 * 
 * This class provides:
 * - State tracking to prevent double-free
 * - Thread-safe validity checks
 * - Debug logging for handle lifecycle
 * - Automatic cleanup on destruction
 */
template <typename HandleType>
class SafeHandle {
public:
    enum class State {
        UNALLOCATED,
        ALLOCATED,
        FREED,
        INVALID
    };

    SafeHandle(const std::string& name, std::shared_ptr<HandleType> handle) 
        : name_(name), 
          handle_(handle), 
          state_(State::UNALLOCATED),
          ref_count_(0) {
        SQL_LOG_DEBUG_STREAM("SafeHandle created: " << name_);
    }

    ~SafeHandle() {
        SQL_LOG_DEBUG_STREAM("SafeHandle destructor: " << name_ << " state=" << static_cast<int>(state_.load()));
        if (state_ == State::ALLOCATED) {
            SQL_LOG_WARNING_STREAM("SafeHandle destroyed while still allocated: " << name_);
            free();
        }
    }

    bool alloc(SQLHANDLE parent = SQL_NULL_HANDLE) {
        std::lock_guard<std::mutex> lock(mutex_);
        
        if (state_ == State::ALLOCATED) {
            SQL_LOG_WARNING_STREAM("SafeHandle already allocated: " << name_);
            return false;
        }
        
        if (state_ == State::FREED) {
            SQL_LOG_ERROR_STREAM("SafeHandle attempting to allocate after free: " << name_);
            return false;
        }
        
        SQL_LOG_DEBUG_STREAM("SafeHandle allocating: " << name_);
        
        if (!handle_) {
            SQL_LOG_ERROR_STREAM("SafeHandle has null internal handle: " << name_);
            state_ = State::INVALID;
            return false;
        }
        
        if (handle_->alloc(parent)) {
            state_ = State::ALLOCATED;
            allocation_stack_ = captureStackTrace();
            SQL_LOG_DEBUG_STREAM("SafeHandle allocated successfully: " << name_);
            return true;
        }
        
        SQL_LOG_ERROR_STREAM("SafeHandle allocation failed: " << name_);
        state_ = State::INVALID;
        return false;
    }

    void free() {
        std::lock_guard<std::mutex> lock(mutex_);
        
        if (state_ == State::FREED) {
            SQL_LOG_ERROR_STREAM("SafeHandle double-free detected: " << name_ 
                << " Originally freed from: " << free_stack_);
            return;
        }
        
        if (state_ != State::ALLOCATED) {
            SQL_LOG_WARNING_STREAM("SafeHandle free called on non-allocated handle: " << name_ 
                << " state=" << static_cast<int>(state_.load()));
            return;
        }
        
        if (ref_count_ > 0) {
            SQL_LOG_WARNING_STREAM("SafeHandle freed while still referenced: " << name_ 
                << " ref_count=" << ref_count_.load());
        }
        
        SQL_LOG_DEBUG_STREAM("SafeHandle freeing: " << name_);
        handle_->free();
        state_ = State::FREED;
        free_stack_ = captureStackTrace();
    }
    
    /**
     * @brief Force reset reference count - use only during cleanup
     */
    void resetReferences() {
        std::lock_guard<std::mutex> lock(mutex_);
        if (ref_count_ > 0) {
            SQL_LOG_DEBUG_STREAM("SafeHandle reset references: " << name_ 
                << " was=" << ref_count_.load());
            ref_count_ = 0;
        }
    }

    bool isValid() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return state_ == State::ALLOCATED && handle_ && handle_->get_handle() != SQL_NULL_HANDLE;
    }

    std::shared_ptr<HandleType> get() {
        std::lock_guard<std::mutex> lock(mutex_);
        
        if (state_ != State::ALLOCATED) {
            SQL_LOG_ERROR_STREAM("SafeHandle accessing invalid handle: " << name_ 
                << " state=" << static_cast<int>(state_.load()));
            return nullptr;
        }
        
        ref_count_++;
        return handle_;
    }

    void release() {
        std::lock_guard<std::mutex> lock(mutex_);
        if (ref_count_ > 0) {
            ref_count_--;
        }
    }

    State getState() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return state_.load();
    }

    const std::string& getName() const {
        return name_;
    }

    /**
     * @brief Mark handle as already allocated (for externally managed handles)
     */
    void markAsAllocated() {
        std::lock_guard<std::mutex> lock(mutex_);
        if (state_ == State::UNALLOCATED && handle_ && handle_->get_handle() != SQL_NULL_HANDLE) {
            state_ = State::ALLOCATED;
            SQL_LOG_DEBUG_STREAM("SafeHandle marked as allocated: " << name_);
        }
    }

    // RAII helper for automatic reference counting
    class Reference {
    public:
        Reference(SafeHandle* handle) : handle_(handle), ptr_(nullptr) {
            if (handle_) {
                ptr_ = handle_->get();
            }
        }
        
        ~Reference() {
            if (handle_ && ptr_) {
                handle_->release();
            }
        }
        
        std::shared_ptr<HandleType> operator->() const { return ptr_; }
        std::shared_ptr<HandleType> get() const { return ptr_; }
        bool isValid() const { return ptr_ != nullptr; }
        
    private:
        SafeHandle* handle_;
        std::shared_ptr<HandleType> ptr_;
    };

private:
    std::string captureStackTrace() const {
        // In production, you might want to use backtrace() or similar
        // For now, just return a placeholder
        return "Stack trace not implemented";
    }

    const std::string name_;
    std::shared_ptr<HandleType> handle_;
    mutable std::mutex mutex_;
    std::atomic<State> state_;
    std::atomic<int> ref_count_;
    std::string allocation_stack_;
    std::string free_stack_;
};

}  // namespace mssql