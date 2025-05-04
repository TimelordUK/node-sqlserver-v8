#include "Logger.h"
#include <iostream>
#include <ctime>
#include <iomanip>
#include <chrono>
#include <sstream>

namespace mssql
{

  Logger &Logger::GetInstance()
  {
    static Logger instance;
    return instance;
  }

  Logger::Logger() {}

  Logger::~Logger()
  {
    if (logFile_.is_open())
    {
      logFile_.close();
    }
  }

  void Logger::SetLogLevel(LogLevel level)
  {
    std::lock_guard<std::mutex> lock(mutex_);
    currentLevel_ = level;
  }

  void Logger::SetLogToFile(const std::string &filePath)
  {
    std::lock_guard<std::mutex> lock(mutex_);
    if (logFile_.is_open())
    {
      logFile_.close();
    }

    if (!filePath.empty())
    {
      logFile_.open(filePath, std::ios::app);
    }
  }

  void Logger::SetLogToConsole(bool enabled)
  {
    std::lock_guard<std::mutex> lock(mutex_);
    logToConsole_ = enabled;
  }

  std::string Logger::LevelToString(LogLevel level)
  {
    switch (level)
    {
    case LogLevel::Error:
      return "ERROR";
    case LogLevel::Warning:
      return "WARNING";
    case LogLevel::Info:
      return "INFO";
    case LogLevel::Debug:
      return "DEBUG";
    case LogLevel::Trace:
      return "TRACE";
    default:
      return "UNKNOWN";
    }
  }

  void Logger::Log(LogLevel level, const std::string &message)
  {
    if (!IsEnabled(level))
    {
      return;
    }

    std::lock_guard<std::mutex> lock(mutex_);

    // Get current time with millisecond precision
    auto now = std::chrono::system_clock::now();
    auto time_t_now = std::chrono::system_clock::to_time_t(now);
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                  now.time_since_epoch()) %
              1000;

    std::tm tm_buf;
#ifdef _WIN32
    localtime_s(&tm_buf, &time_t_now);
#else
    localtime_r(&time_t_now, &tm_buf);
#endif

    // Format timestamp as ISO8601 with milliseconds: YYYY-MM-DDThh:mm:ss.sssZ
    std::ostringstream timestamp;
    timestamp << std::put_time(&tm_buf, "%Y-%m-%dT%H:%M:%S")
              << '.' << std::setfill('0') << std::setw(3) << ms.count() << 'Z';

    std::string levelStr = LevelToString(level);
    std::ostringstream logLine;
    logLine << "[" << timestamp.str() << "] [" << levelStr << "] " << message;

    if (logToConsole_)
    {
      std::cout << logLine.str() << std::endl;
    }

    if (logFile_.is_open())
    {
      logFile_ << logLine.str() << std::endl;
    }
  }

  void Logger::Error(const std::string &message)
  {
    Log(LogLevel::Error, message);
  }

  void Logger::Warning(const std::string &message)
  {
    Log(LogLevel::Warning, message);
  }

  void Logger::Info(const std::string &message)
  {
    Log(LogLevel::Info, message);
  }

  void Logger::Debug(const std::string &message)
  {
    Log(LogLevel::Debug, message);
  }

  void Logger::Trace(const std::string &message)
  {
    Log(LogLevel::Trace, message);
  }

} // namespace mssql