#pragma once

// Detect platform
#if defined(_WIN32) || defined(WIN32) || defined(_MSC_VER)
#define PLATFORM_WINDOWS
#elif defined(__linux__) || defined(linux) || defined(__linux)
#define PLATFORM_LINUX
#elif defined(__APPLE__) || defined(__MACH__)
#define PLATFORM_MACOS
#else
#error "Unsupported platform"
#endif

// Common C++ headers
#include <vector>
#include <queue>
#include <string>
#include <functional>
#include <algorithm>
#include <numeric>
#include <memory>
#include <mutex>
#include <thread>
#include <chrono>

// Platform-specific headers
#ifdef PLATFORM_WINDOWS
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
// Silence C++17 deprecation warnings for codecvt
#define _SILENCE_CXX17_CODECVT_HEADER_DEPRECATION_WARNING
typedef CRITICAL_SECTION PlatformMutex;

// Platform-specific mutex initialization
inline void InitializeMutex(PlatformMutex* mutex) {
  InitializeCriticalSection(mutex);
}

// Platform-specific mutex destruction
inline void DestroyMutex(PlatformMutex* mutex) {
  DeleteCriticalSection(mutex);
}

// Platform-specific mutex locking
inline void LockMutex(PlatformMutex* mutex) {
  EnterCriticalSection(mutex);
}

// Platform-specific mutex unlocking
inline void UnlockMutex(PlatformMutex* mutex) {
  LeaveCriticalSection(mutex);
}

#elif defined(PLATFORM_LINUX) || defined(PLATFORM_MACOS)
#include <pthread.h>
#include <unistd.h>
#include <signal.h>
typedef pthread_mutex_t PlatformMutex;

inline void InitializeMutex(PlatformMutex* mutex) {
  pthread_mutex_init(mutex, nullptr);
}

inline void DestroyMutex(PlatformMutex* mutex) {
  pthread_mutex_destroy(mutex);
}

inline void LockMutex(PlatformMutex* mutex) {
  pthread_mutex_lock(mutex);
}

inline void UnlockMutex(PlatformMutex* mutex) {
  pthread_mutex_unlock(mutex);
}
#endif

// Platform-independent mutex wrapper
class Mutex {
 public:
  Mutex() {
    InitializeMutex(&mutex_);
  }
  ~Mutex() {
    DestroyMutex(&mutex_);
  }

  void lock() {
    LockMutex(&mutex_);
  }
  void unlock() {
    UnlockMutex(&mutex_);
  }

 private:
  PlatformMutex mutex_;

  // Prevent copying
  Mutex(const Mutex&) = delete;
  Mutex& operator=(const Mutex&) = delete;
};

// Platform-independent scoped lock
class ScopedLock {
 public:
  explicit ScopedLock(Mutex& mutex) : mutex_(mutex) {
    mutex_.lock();
  }
  ~ScopedLock() {
    mutex_.unlock();
  }

 private:
  Mutex& mutex_;

  // Prevent copying
  ScopedLock(const ScopedLock&) = delete;
  ScopedLock& operator=(const ScopedLock&) = delete;
};

// Platform-specific signal handling
namespace Platform {
  // Initialize platform-specific signal handlers
  inline void InitializeSignalHandlers() {
#if defined(PLATFORM_LINUX) || defined(PLATFORM_MACOS)
    // Ignore SIGPIPE on Unix-like systems to handle broken pipes gracefully
    // This prevents the process from terminating when writing to a closed pipe
    signal(SIGPIPE, SIG_IGN);
#endif
    // Windows doesn't have SIGPIPE, it returns EPIPE errors instead
  }
  
  // Check if a stream is still valid for writing
  template<typename Stream>
  inline bool IsStreamGood(Stream& stream) {
    return stream.good();
  }
  
  // Safe stream write that handles broken pipes
  template<typename Stream>
  inline bool SafeStreamWrite(Stream& stream, const std::string& data) {
    if (!IsStreamGood(stream)) {
      return false;
    }
    
    stream << data;
    
    // Only flush if the write succeeded
    if (IsStreamGood(stream)) {
      stream.flush();
      return true;
    }
    
    return false;
  }
}