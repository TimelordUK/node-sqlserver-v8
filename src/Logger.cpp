#include "logger.h"
#include <iostream>
#include <ctime>
#include <iomanip>

namespace mssql {

    Logger& Logger::GetInstance() {
        static Logger instance;
        return instance;
    }

    Logger::Logger() {}

    Logger::~Logger() {
        if (logFile_.is_open()) {
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
        case LogLevel::Error: return "ERROR";
        case LogLevel::Warning: return "WARNING";
        case LogLevel::Info: return "INFO";
        case LogLevel::Debug: return "DEBUG";
        case LogLevel::Trace: return "TRACE";
        default: return "UNKNOWN";
        }
    }

    void Logger::Log(LogLevel level, const std::string& message) {
        if (currentLevel_ < level) {
            return;
        }

        std::lock_guard<std::mutex> lock(mutex_);

        // Get current time
        auto now = std::time(nullptr);
        std::tm tm_buf;

#ifdef _WIN32
        localtime_s(&tm_buf, &now);
#else
        localtime_r(&now, &tm_buf);
#endif

        std::ostringstream timestamp;
        timestamp << std::put_time(&tm_buf, "%Y-%m-%d %H:%M:%S");

        const std::string levelStr = LevelToString(level);
        const std::string formattedMessage =
            "[" + timestamp.str() + "] [" + levelStr + "] " + message;

        // Log to file if enabled
        if (logFile_.is_open()) {
            logFile_ << formattedMessage << std::endl;
            logFile_.flush();
        }

        // Log to console if enabled
        if (logToConsole_) {
            std::ostream& stream = (level == LogLevel::Error) ? std::cerr : std::cout;
            stream << formattedMessage << std::endl;
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

} // namespace mssql