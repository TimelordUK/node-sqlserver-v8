#pragma once

#include <platform.h>
#include <common/odbc_common.h>
#include <utils/Logger.h>
#include <memory>
#include <mutex>
#include <vector>
#include <string>

namespace mssql {
class OdbcError {
 public:
  OdbcError(const char* sqlstate,
            const char* message,
            SQLINTEGER code,
            const int severity,
            const char* serverName,
            const char* procName,
            const unsigned int lineNumber)
      : sqlstate(sqlstate),
        message(message),
        code(code),
        severity(severity),
        serverName(serverName),
        procName(procName),
        lineNumber(lineNumber) {}

  OdbcError(const std::string& sqlstate, const std::string& message, int code)
      : sqlstate(sqlstate),
        message(message),
        code(code),
        severity(0),
        serverName(""),
        procName(""),
        lineNumber(0) {}

  void log() {
    SQL_LOG_DEBUG_STREAM("OdbcError: " << sqlstate << ", " << message << ", " << code << ", "
                                       << severity << ", " << serverName << ", " << procName << ", "
                                       << lineNumber);
  }

  // list of msnodesql specific errors
  static OdbcError NODE_SQL_NO_DATA;

  string sqlstate;
  string message;
  SQLINTEGER code;
  int severity;
  string serverName;
  string procName;
  unsigned int lineNumber;
};
}  // namespace mssql