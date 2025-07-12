#include "Logger.h"
#include "common/platform.h"

#include <chrono>
#include <codecvt>
#include <ctime>
#include <iomanip>
#include <iostream>
#include <locale>
#include <sstream>
#include <thread>

namespace mssql {

Logger& Logger::GetInstance() {
  static Logger instance;
  return instance;
}

Logger::Logger() {}

Logger::~Logger() {
  // Flush console output before destruction
  if (logToConsole_) {
    // Only flush if streams are still good (handles EPIPE)
    if (Platform::IsStreamGood(std::cout)) {
      std::cout.flush();
    }
    if (Platform::IsStreamGood(std::cerr)) {
      std::cerr.flush();
    }
  }
  
  if (logFile_.is_open()) {
    logFile_.flush();
    logFile_.close();
  }
}

void Logger::SetLogLevel(LogLevel level) {
  std::lock_guard<std::mutex> lock(mutex_);
  currentLevel_ = level;
}

void Logger::SetLogToFile(const std::string& filePath) {
  std::lock_guard<std::mutex> lock(mutex_);
  if (logFile_.is_open()) {
    logFile_.close();
  }

  if (!filePath.empty()) {
    logFile_.open(filePath, std::ios::app);
  }
}

void Logger::SetLogToConsole(bool enabled) {
  std::lock_guard<std::mutex> lock(mutex_);
  logToConsole_ = enabled;
}

std::string Logger::LevelToString(LogLevel level) {
  switch (level) {
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

void Logger::Log(LogLevel level, const std::string& message) {
  if (!IsEnabled(level)) {
    return;
  }

  std::lock_guard<std::mutex> lock(mutex_);

  // Get current time with millisecond precision
  auto now = std::chrono::system_clock::now();
  auto time_t_now = std::chrono::system_clock::to_time_t(now);
  auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()) % 1000;

  std::tm tm_buf;
#ifdef _WIN32
  localtime_s(&tm_buf, &time_t_now);
#else
  localtime_r(&time_t_now, &tm_buf);
#endif

  // Format timestamp as ISO8601 with milliseconds: YYYY-MM-DDThh:mm:ss.sssZ
  std::ostringstream timestamp;
  timestamp << std::put_time(&tm_buf, "%Y-%m-%dT%H:%M:%S") << '.' << std::setfill('0')
            << std::setw(3) << ms.count() << 'Z';

  // Get thread ID
  std::ostringstream threadId;
  threadId << std::this_thread::get_id();

  std::string levelStr = LevelToString(level);
  std::ostringstream logLine;
  logLine << "[" << timestamp.str() << "] [CPP] [" << threadId.str() << "] [" << levelStr << "] " << message;

  if (logToConsole_) {
    // Write to appropriate stream based on log level
    std::ostream& out = (level <= LogLevel::Warning) ? std::cerr : std::cout;
    
    // Use platform-safe stream writing that handles broken pipes
    Platform::SafeStreamWrite(out, logLine.str() + "\n");
  }

  if (logFile_.is_open()) {
    logFile_ << logLine.str() << std::endl;
  }
}

void Logger::Error(const std::string& message) {
  Log(LogLevel::Error, message);
}

void Logger::Warning(const std::string& message) {
  Log(LogLevel::Warning, message);
}

void Logger::Info(const std::string& message) {
  Log(LogLevel::Info, message);
}

void Logger::Debug(const std::string& message) {
  Log(LogLevel::Debug, message);
}

void Logger::Trace(const std::string& message) {
  Log(LogLevel::Trace, message);
}

// Wide string (wstring) conversion and logging methods
std::string Logger::WideToUtf8(const std::wstring& wide) {
  try {
    std::wstring_convert<std::codecvt_utf8<wchar_t>> converter;
    return converter.to_bytes(wide);
  } catch (const std::exception&) {
    return "(Error converting wide string)";
  }
}

// UTF-16 string (u16string) conversion method
std::string Logger::Utf16ToUtf8(const std::u16string& utf16) {
  try {
    std::wstring_convert<std::codecvt_utf8_utf16<char16_t>, char16_t> converter;
    return converter.to_bytes(utf16);
  } catch (const std::exception&) {
    return "(Error converting UTF-16 string)";
  }
}

// Wide string logging implementations
void Logger::Log(LogLevel level, const std::wstring& message) {
  Log(level, WideToUtf8(message));
}

void Logger::Error(const std::wstring& message) {
  Error(WideToUtf8(message));
}

void Logger::Warning(const std::wstring& message) {
  Warning(WideToUtf8(message));
}

void Logger::Info(const std::wstring& message) {
  Info(WideToUtf8(message));
}

void Logger::Debug(const std::wstring& message) {
  Debug(WideToUtf8(message));
}

void Logger::Trace(const std::wstring& message) {
  Trace(WideToUtf8(message));
}

// UTF-16 string logging implementations
void Logger::Log(LogLevel level, const std::u16string& message) {
  Log(level, Utf16ToUtf8(message));
}

void Logger::Error(const std::u16string& message) {
  Error(Utf16ToUtf8(message));
}

void Logger::Warning(const std::u16string& message) {
  Warning(Utf16ToUtf8(message));
}

void Logger::Info(const std::u16string& message) {
  Info(Utf16ToUtf8(message));
}

void Logger::Debug(const std::u16string& message) {
  Debug(Utf16ToUtf8(message));
}

void Logger::Trace(const std::u16string& message) {
  Trace(Utf16ToUtf8(message));
}

}  // namespace mssql