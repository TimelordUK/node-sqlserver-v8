// Create this file in your project
#pragma once
#include <string>
#include <fstream>
#include <mutex>
#include <functional>
#include <sstream>

namespace mssql
{

  enum class LogLevel
  {
    Silent = 0,
    Error = 1,
    Warning = 2,
    Info = 3,
    Debug = 4,
    Trace = 5
  };

  class Logger
  {
  public:
    static Logger &GetInstance();

    void SetLogLevel(LogLevel level);
    void SetLogToFile(const std::string &filePath);
    void SetLogToConsole(bool enabled);

    void Log(LogLevel level, const std::string &message);
    void Error(const std::string &message);
    void Warning(const std::string &message);
    void Info(const std::string &message);
    void Debug(const std::string &message);
    void Trace(const std::string &message);

    bool IsEnabled(LogLevel level) const { return currentLevel_ >= level; }

  private:
    Logger();
    ~Logger();

    Logger(const Logger &) = delete;
    Logger &operator=(const Logger &) = delete;

    std::string LevelToString(LogLevel level);

    LogLevel currentLevel_ = LogLevel::Info;
    bool logToConsole_ = false;
    std::ofstream logFile_;

    std::mutex mutex_;
  };

  // Convenience macros
// In Logger.h, replace your existing macros with these:
#define SQL_LOG_ERROR(msg) mssql::Logger::GetInstance().Error(std::string(__func__) + ": " + msg)
#define SQL_LOG_WARNING(msg) mssql::Logger::GetInstance().Warning(std::string(__func__) + ": " + msg)
#define SQL_LOG_INFO(msg) mssql::Logger::GetInstance().Info(std::string(__func__) + ": " + msg)
#define SQL_LOG_DEBUG(msg) mssql::Logger::GetInstance().Debug(std::string(__func__) + ": " + msg)
#define SQL_LOG_TRACE(msg) mssql::Logger::GetInstance().Trace(std::string(__func__) + ": " + msg)
// Add stream-style macros:
#define SQL_LOG_ERROR_STREAM(expr)                                      \
  do                                                                    \
  {                                                                     \
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Error)) \
    {                                                                   \
      std::ostringstream oss;                                           \
      oss << __func__ << ": " << expr;                                  \
      mssql::Logger::GetInstance().Error(oss.str());                    \
    }                                                                   \
  } while (0)

#define SQL_LOG_WARNING_STREAM(expr)                                      \
  do                                                                      \
  {                                                                       \
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Warning)) \
    {                                                                     \
      std::ostringstream oss;                                             \
      oss << __func__ << ": " << expr;                                    \
      mssql::Logger::GetInstance().Warning(oss.str());                    \
    }                                                                     \
  } while (0)

#define SQL_LOG_INFO_STREAM(expr)                                      \
  do                                                                   \
  {                                                                    \
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Info)) \
    {                                                                  \
      std::ostringstream oss;                                          \
      oss << __func__ << ": " << expr;                                 \
      mssql::Logger::GetInstance().Info(oss.str());                    \
    }                                                                  \
  } while (0)

#define SQL_LOG_DEBUG_STREAM(expr)                                      \
  do                                                                    \
  {                                                                     \
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Debug)) \
    {                                                                   \
      std::ostringstream oss;                                           \
      oss << __func__ << ": " << expr;                                  \
      mssql::Logger::GetInstance().Debug(oss.str());                    \
    }                                                                   \
  } while (0)

#define SQL_LOG_TRACE_STREAM(expr)                                      \
  do                                                                    \
  {                                                                     \
    if (mssql::Logger::GetInstance().IsEnabled(mssql::LogLevel::Trace)) \
    {                                                                   \
      std::ostringstream oss;                                           \
      oss << __func__ << ": " << expr;                                  \
      mssql::Logger::GetInstance().Trace(oss.str());                    \
    }                                                                   \
  } while (0)

} // namespace mssql