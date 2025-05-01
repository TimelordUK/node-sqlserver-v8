#pragma once

#include <platform.h>
#include <odbc_common.h>
#include <odbc_handles.h>
#include <memory>
#include <mutex>
#include <vector>
#include <string>

namespace mssql
{

  class OdbcError
  {
  public:
    OdbcError(const char *sqlstate, const char *message, SQLINTEGER code,
              const int severity, const char *serverName, const char *procName, const unsigned int lineNumber)
        : sqlstate(sqlstate),
          message(message),
          code(code),
          severity(severity),
          serverName(serverName),
          procName(procName),
          lineNumber(lineNumber)
    {
    }

    OdbcError(const std::string &message, const std::string &sqlstate, int code)
        : sqlstate(sqlstate),
          message(message),
          code(code), severity(0),
          serverName(""),
          procName(""),
          lineNumber(0) {}

    const char *Message(void) const
    {
      return message.c_str();
    }

    const char *SqlState(void) const
    {
      return sqlstate.c_str();
    }

    SQLINTEGER Code(void) const
    {
      return code;
    }

    int Severity(void) const
    {
      return severity;
    }

    const char *ServerName(void) const
    {
      return serverName.c_str();
    }

    const char *ProcName(void) const
    {
      return procName.c_str();
    }

    unsigned int LineNumber(void) const
    {
      return lineNumber;
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
}