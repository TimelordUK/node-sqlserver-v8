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
#include <atomic>
#include <thread>
#include <chrono>

// Platform-specific headers
#ifdef PLATFORM_WINDOWS
    // Windows headers
    #include <windows.h>
    
    // SQL Server headers for Windows
    #include <sql.h>
    #include <sqlext.h>
    #include <sqltypes.h>
    #include <sqlucode.h>
    #include "sqlncli.h"  // SQL Server specific constants
    
    // Define platform-specific types
    typedef CRITICAL_SECTION PlatformMutex;
    
    // Platform-specific mutex initialization
    inline void InitializeMutex(PlatformMutex* mutex) {
        InitializeCriticalSection(mutex);
    }
    
    // Platform-specific mutex deletion
    inline void DeleteMutex(PlatformMutex* mutex) {
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
    
#elif defined(PLATFORM_LINUX)
    // Compiler-specific settings for Linux
    #ifdef __GNUC__
        #define GCC_VERSION (__GNUC__ * 10000 + __GNUC_MINOR__ * 100 + __GNUC_PATCHLEVEL__)
        #if GCC_VERSION > 90200
            #pragma GCC diagnostic ignored "-Wcast-function-type"
        #endif
    #endif
    
    // ODBC headers for Linux
    #include <sql.h>
    #include <sqlext.h>
    #include <sqltypes.h>
    #include <sqlspi.h>
    #include <sqlucode.h>
    #include <msodbcsql.h>
    #include <sqlncli-linux.h>
    
    // Define platform-specific types using pthread
    #include <pthread.h>
    typedef pthread_mutex_t PlatformMutex;
    
    // Platform-specific mutex initialization
    inline void InitializeMutex(PlatformMutex* mutex) {
        pthread_mutex_init(mutex, nullptr);
    }
    
    // Platform-specific mutex deletion
    inline void DeleteMutex(PlatformMutex* mutex) {
        pthread_mutex_destroy(mutex);
    }
    
    // Platform-specific mutex locking
    inline void LockMutex(PlatformMutex* mutex) {
        pthread_mutex_lock(mutex);
    }
    
    // Platform-specific mutex unlocking
    inline void UnlockMutex(PlatformMutex* mutex) {
        pthread_mutex_unlock(mutex);
    }
    
#elif defined(PLATFORM_MACOS)
    // macOS headers
    #include <pthread.h>
    
    // ODBC headers for macOS
    #include <sql.h>
    #include <sqlext.h>
    #include <sqltypes.h>
    #include <sqlucode.h>
    
    // Define platform-specific types using pthread
    typedef pthread_mutex_t PlatformMutex;
    
    // Platform-specific mutex initialization
    inline void InitializeMutex(PlatformMutex* mutex) {
        pthread_mutex_init(mutex, nullptr);
    }
    
    // Platform-specific mutex deletion
    inline void DeleteMutex(PlatformMutex* mutex) {
        pthread_mutex_destroy(mutex);
    }
    
    // Platform-specific mutex locking
    inline void LockMutex(PlatformMutex* mutex) {
        pthread_mutex_lock(mutex);
    }
    
    // Platform-specific mutex unlocking
    inline void UnlockMutex(PlatformMutex* mutex) {
        pthread_mutex_unlock(mutex);
    }
#endif

// Common SQL Server constants
#define SQL_SERVER_DEFAULT_YEAR  1900
#define SQL_SERVER_DEFAULT_MONTH 1  // JS months are 0 based, SQL Server months are 1 based
#define SQL_SERVER_DEFAULT_DAY   1
#define JS_DEFAULT_YEAR  1970

// Error handling macro
#define ErrorIf(x) if (x) goto Error;


// In platform.h
#ifdef PLATFORM_WINDOWS
    // Use Unicode versions of ODBC functions on Windows

    
    // Helper function to convert SQL character types
    inline std::wstring SQLCharToString(SQLWCHAR* sqlStr, SQLSMALLINT length) {
        return std::wstring(reinterpret_cast<wchar_t*>(sqlStr), length);
    }
    
    // Helper to create SQL character buffers
    inline SQLWCHAR* CreateSQLCharBuffer(size_t size) {
        return new SQLWCHAR[size]();
    }
    
    // Helper to delete SQL character buffers
    inline void DeleteSQLCharBuffer(SQLWCHAR* buffer) {
        delete[] buffer;
    }
#else    
    // Helper function to convert SQL character types
    inline std::string SQLCharToString(SQLCHAR* sqlStr, SQLSMALLINT length) {
        return std::string(reinterpret_cast<char*>(sqlStr), length);
    }
    
    // Helper to create SQL character buffers
    inline SQLCHAR* CreateSQLCharBuffer(size_t size) {
        return new SQLCHAR[size]();
    }
    
    // Helper to delete SQL character buffers
    inline void DeleteSQLCharBuffer(SQLCHAR* buffer) {
        delete[] buffer;
    }
#endif