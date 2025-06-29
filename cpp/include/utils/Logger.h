// Create this file in your project
#pragma once
#include <fstream>
#include <functional>
#include <mutex>
#include <sstream>
#include <string>

namespace mssql {

enum class LogLevel { Silent = 0, Error = 1, Warning = 2, Info = 3, Debug = 4, Trace = 5 };

class Logger {
 public:
  static Logger& GetInstance();

  void SetLogLevel(LogLevel level);
  void SetLogToFile(const std::string& filePath);
  void SetLogToConsole(bool enabled);

  // Regular string logging
  void Log(LogLevel level, const std::string& message);
  void Error(const std::string& message);
  void Warning(const std::string& message);
  void Info(const std::string& message);
  void Debug(const std::string& message);
  void Trace(const std::string& message);

  // Wide string logging
  void Log(LogLevel level, const std::wstring& message);
  void Error(const std::wstring& message);
  void Warning(const std::wstring& message);
  void Info(const std::wstring& message);
  void Debug(const std::wstring& message);
  void Trace(const std::wstring& message);

  // UTF-16 string logging (u16string)
  void Log(LogLevel level, const std::u16string& message);
  void Error(const std::u16string& message);
  void Warning(const std::u16string& message);
  void Info(const std::u16string& message);
  void Debug(const std::u16string& message);
  void Trace(const std::u16string& message);

  bool IsEnabled(LogLevel level) const {
    return currentLevel_ >= level;
  }

 private:
  Logger();
  ~Logger();

  Logger(const Logger&) = delete;
  Logger& operator=(const Logger&) = delete;

  std::string LevelToString(LogLevel level);
  std::string WideToUtf8(const std::wstring& wide);
  std::string Utf16ToUtf8(const std::u16string& utf16);

  LogLevel currentLevel_ = LogLevel::Info;
  bool logToConsole_ = false;
  std::ofstream logFile_;

  std::mutex mutex_;
};

// Convenience macros with lazy evaluation
// NOLINTBEGIN(cppcoreguidelines-macro-usage)
// Logging macros need to be macros for:
// 1. Lazy evaluation (only construct strings when logging is enabled)
// 2. Capture of __func__ at call site
// 3. Minimal performance overhead when logging is disabled
#define SQL_LOG_ERROR(msg)                                                    \
  do {                                                                        \
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Error)) {     \
      mssql::Logger::GetInstance().Error(std::string(__func__) + ": " + msg); \
    }                                                                         \
  } while (0)

#define SQL_LOG_WARNING(msg)                                                    \
  do {                                                                          \
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Warning)) {     \
      mssql::Logger::GetInstance().Warning(std::string(__func__) + ": " + msg); \
    }                                                                           \
  } while (0)

#define SQL_LOG_INFO(msg)                                                    \
  do {                                                                       \
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Info)) {     \
      mssql::Logger::GetInstance().Info(std::string(__func__) + ": " + msg); \
    }                                                                        \
  } while (0)

#define SQL_LOG_DEBUG(msg)                                                    \
  do {                                                                        \
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Debug)) {     \
      mssql::Logger::GetInstance().Debug(std::string(__func__) + ": " + msg); \
    }                                                                         \
  } while (0)

#define SQL_LOG_TRACE(msg)                                                    \
  do {                                                                        \
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Trace)) {     \
      mssql::Logger::GetInstance().Trace(std::string(__func__) + ": " + msg); \
    }                                                                         \
  } while (0)
// Add stream-style macros:
#define SQL_LOG_ERROR_STREAM(expr)                                        \
  do {                                                                    \
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Error)) { \
      std::ostringstream oss;                                             \
      oss << __func__ << ": " << expr;                                    \
      mssql::Logger::GetInstance().Error(oss.str());                      \
    }                                                                     \
  } while (0)

#define SQL_LOG_WARNING_STREAM(expr)                                        \
  do {                                                                      \
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Warning)) { \
      std::ostringstream oss;                                               \
      oss << __func__ << ": " << expr;                                      \
      mssql::Logger::GetInstance().Warning(oss.str());                      \
    }                                                                       \
  } while (0)

#define SQL_LOG_INFO_STREAM(expr)                                        \
  do {                                                                   \
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Info)) { \
      std::ostringstream oss;                                            \
      oss << __func__ << ": " << expr;                                   \
      mssql::Logger::GetInstance().Info(oss.str());                      \
    }                                                                    \
  } while (0)

#define SQL_LOG_DEBUG_STREAM(expr)                                        \
  do {                                                                    \
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Debug)) { \
      std::ostringstream oss;                                             \
      oss << __func__ << ": " << expr;                                    \
      mssql::Logger::GetInstance().Debug(oss.str());                      \
    }                                                                     \
  } while (0)

#define SQL_LOG_TRACE_STREAM(expr)                                        \
  do {                                                                    \
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Trace)) { \
      std::ostringstream oss;                                             \
      oss << __func__ << ": " << expr;                                    \
      mssql::Logger::GetInstance().Trace(oss.str());                      \
    }                                                                     \
  } while (0)

// Wide string (wstring) stream macros
#define SQL_LOG_ERROR_WSTREAM(expr)                                       \
  do {                                                                    \
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Error)) { \
      std::wostringstream woss;                                           \
      woss << __func__ << L": " << expr;                                  \
      mssql::Logger::GetInstance().Error(woss.str());                     \
    }                                                                     \
  } while (0)

#define SQL_LOG_WARNING_WSTREAM(expr)                                       \
  do {                                                                      \
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Warning)) { \
      std::wostringstream woss;                                             \
      woss << __func__ << L": " << expr;                                    \
      mssql::Logger::GetInstance().Warning(woss.str());                     \
    }                                                                       \
  } while (0)

#define SQL_LOG_INFO_WSTREAM(expr)                                       \
  do {                                                                   \
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Info)) { \
      std::wostringstream woss;                                          \
      woss << __func__ << L": " << expr;                                 \
      mssql::Logger::GetInstance().Info(woss.str());                     \
    }                                                                    \
  } while (0)

#define SQL_LOG_DEBUG_WSTREAM(expr)                                       \
  do {                                                                    \
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Debug)) { \
      std::wostringstream woss;                                           \
      woss << __func__ << L": " << expr;                                  \
      mssql::Logger::GetInstance().Debug(woss.str());                     \
    }                                                                     \
  } while (0)

#define SQL_LOG_TRACE_WSTREAM(expr)                                       \
  do {                                                                    \
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Trace)) { \
      std::wostringstream woss;                                           \
      woss << __func__ << L": " << expr;                                  \
      mssql::Logger::GetInstance().Trace(woss.str());                     \
    }                                                                     \
  } while (0)

// UTF-16 string (u16string) stream macros
#define SQL_LOG_ERROR_U16STREAM(expr)                                     \
  do {                                                                    \
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Error)) { \
      std::basic_ostringstream<char16_t> u16oss;                          \
      u16oss << u"" << expr;                                              \
      mssql::Logger::GetInstance().Error(u16oss.str());                   \
    }                                                                     \
  } while (0)

#define SQL_LOG_WARNING_U16STREAM(expr)                                     \
  do {                                                                      \
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Warning)) { \
      std::basic_ostringstream<char16_t> u16oss;                            \
      u16oss << u"" << expr;                                                \
      mssql::Logger::GetInstance().Warning(u16oss.str());                   \
    }                                                                       \
  } while (0)

#ifdef __APPLE__
// macOS doesn't support std::ctype<char16_t>, so convert to regular string
#define SQL_LOG_INFO_U16STREAM(expr)                                     \
  do {                                                                   \
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Info)) { \
      std::ostringstream oss;                                             \
      oss << expr;                                                        \
      mssql::Logger::GetInstance().Info(oss.str());                       \
    }                                                                    \
  } while (0)
#else
#define SQL_LOG_INFO_U16STREAM(expr)                                     \
  do {                                                                   \
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Info)) { \
      std::basic_ostringstream<char16_t> u16oss;                         \
      u16oss << u"" << expr;                                             \
      mssql::Logger::GetInstance().Info(u16oss.str());                   \
    }                                                                    \
  } while (0)
#endif

#ifdef __APPLE__
#define SQL_LOG_DEBUG_U16STREAM(expr)                                     \
  do {                                                                    \
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Debug)) { \
      std::ostringstream oss;                                             \
      oss << expr;                                                        \
      mssql::Logger::GetInstance().Debug(oss.str());                      \
    }                                                                     \
  } while (0)
#else
#define SQL_LOG_DEBUG_U16STREAM(expr)                                     \
  do {                                                                    \
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Debug)) { \
      std::basic_ostringstream<char16_t> u16oss;                          \
      u16oss << u"" << expr;                                              \
      mssql::Logger::GetInstance().Debug(u16oss.str());                   \
    }                                                                     \
  } while (0)
#endif

#ifdef __APPLE__
#define SQL_LOG_TRACE_U16STREAM(expr)                                     \
  do {                                                                    \
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Trace)) { \
      std::ostringstream oss;                                             \
      oss << expr;                                                        \
      mssql::Logger::GetInstance().Trace(oss.str());                      \
    }                                                                     \
  } while (0)
#else
#define SQL_LOG_TRACE_U16STREAM(expr)                                     \
  do {                                                                    \
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Trace)) { \
      std::basic_ostringstream<char16_t> u16oss;                          \
      u16oss << u"" << expr;                                              \
      mssql::Logger::GetInstance().Trace(u16oss.str());                   \
    }                                                                     \
  } while (0)
#endif

// Function entry/exit logging helpers
#define SQL_LOG_FUNC_ENTRY()                                              \
  do {                                                                    \
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Trace)) { \
      std::ostringstream oss;                                             \
      oss << ">> Entering " << __func__;                                  \
      mssql::Logger::GetInstance().Trace(oss.str());                      \
    }                                                                     \
  } while (0)

#define SQL_LOG_FUNC_EXIT()                                               \
  do {                                                                    \
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Trace)) { \
      std::ostringstream oss;                                             \
      oss << "<< Leaving " << __func__;                                   \
      mssql::Logger::GetInstance().Trace(oss.str());                      \
    }                                                                     \
  } while (0)

// RAII class for automatic function entry/exit logging
class FunctionTracer {
 public:
  explicit FunctionTracer(const char* funcName) : funcName_(funcName) {
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Trace)) {
      std::ostringstream oss;
      oss << "  >> Entering " << funcName_;
      mssql::Logger::GetInstance().Trace(oss.str());
    }
  }

  ~FunctionTracer() {
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Trace)) {
      std::ostringstream oss;
      oss << "  << Leaving " << funcName_;
      mssql::Logger::GetInstance().Trace(oss.str());
    }
  }

 private:
  const char* funcName_;
};

#define SQL_LOG_FUNC_TRACER() mssql::FunctionTracer _funcTracer(__func__)
// NOLINTEND(cppcoreguidelines-macro-usage)

}  // namespace mssql