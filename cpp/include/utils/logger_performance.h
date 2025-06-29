#pragma once

// Example of compile-time optimization for production builds
// This could be added to Logger.h if zero overhead is critical

#ifdef NDEBUG  // Release mode
  #ifdef DISABLE_ALL_LOGGING
    // Complete removal of logging in production
    #define SQL_LOG_ERROR(msg) ((void)0)
    #define SQL_LOG_WARNING(msg) ((void)0)
    #define SQL_LOG_INFO(msg) ((void)0)
    #define SQL_LOG_DEBUG(msg) ((void)0)
    #define SQL_LOG_TRACE(msg) ((void)0)
    
    #define SQL_LOG_ERROR_STREAM(expr) ((void)0)
    #define SQL_LOG_WARNING_STREAM(expr) ((void)0)
    #define SQL_LOG_INFO_STREAM(expr) ((void)0)
    #define SQL_LOG_DEBUG_STREAM(expr) ((void)0)
    #define SQL_LOG_TRACE_STREAM(expr) ((void)0)
  #else
    // Keep error/warning logging in production, remove debug/trace
    #define SQL_LOG_DEBUG(msg) ((void)0)
    #define SQL_LOG_TRACE(msg) ((void)0)
    #define SQL_LOG_DEBUG_STREAM(expr) ((void)0)
    #define SQL_LOG_TRACE_STREAM(expr) ((void)0)
  #endif
#endif

// Performance comparison:
// 
// With logging macros (SILENT mode):
// - ~2-5 nanoseconds per log call (IsEnabled check + branch)
// - No string operations
// - No memory allocation
//
// With compile-time removal:
// - 0 nanoseconds - completely removed by preprocessor
// - No code generated at all
//
// The current implementation is already very efficient for production use.