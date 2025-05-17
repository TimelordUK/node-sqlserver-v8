#pragma once

#include "platform.h"
#include <common/odbc_common.h>
#include <vector>
#include <set>
#include <memory>
#include <functional> // For std::function

namespace mssql
{
  using namespace std;

  // Forward declarations
  class OdbcError;
  class ConnectionHandles;

  // Interface for all ODBC handles
  class IOdbcHandle
  {
  public:
    virtual ~IOdbcHandle() = default;

    // Core handle operations - note the default implementation parameter value
    virtual bool alloc(SQLHANDLE parent = SQL_NULL_HANDLE) = 0;
    virtual void free() = 0;
    virtual void read_errors(shared_ptr<vector<shared_ptr<OdbcError>>> &errors) const = 0;

    // Get underlying handle
    virtual SQLHANDLE get_handle() const = 0;
  };

  // Specialized handle interfaces - these must not add any new pure virtual methods
  class IOdbcEnvironmentHandle : public IOdbcHandle
  {
  };
  class IOdbcConnectionHandle : public IOdbcHandle
  {
  };
  class IOdbcStatementHandle : public IOdbcHandle
  {
  };
  class IOdbcDescriptorHandle : public IOdbcHandle
  {
  };

  // Concrete implementation of ODBC handles
  template <SQLSMALLINT HandleType, typename InterfaceType>
  class OdbcHandleImpl : public InterfaceType
  {
  public:
    OdbcHandleImpl() : handle_(SQL_NULL_HANDLE) {}

    ~OdbcHandleImpl() override
    {
      free();
    }

    // Make sure the parameter name here exactly matches the interface
    bool alloc(SQLHANDLE parent = SQL_NULL_HANDLE) override
    {
      free();
      SQLRETURN ret = SQLAllocHandle(HandleType, parent, &handle_);
      return SQL_SUCCEEDED(ret);
    }

    void free() override
    {
      if (handle_ != SQL_NULL_HANDLE)
      {
        SQLFreeHandle(HandleType, handle_);
        handle_ = SQL_NULL_HANDLE;
      }
    }

    void read_errors(shared_ptr<vector<shared_ptr<OdbcError>>> &errors) const override
    {
      SQLSMALLINT msg_len = 0;
      SQLRETURN rc2;
      SQLINTEGER native_error = 0;
      std::vector<SQLWCHAR> msg;
      msg.reserve(10 * 1024);
      msg.resize(10 * 1024);
      vector<SQLWCHAR> sql_state;
      sql_state.reserve(6);
      sql_state.resize(6);
      set<string> received;
      int severity = 0;
      SQLSMALLINT serverName_len = 0;
      vector<SQLWCHAR> serverName;
      serverName.reserve(SQL_MAX_SQLSERVERNAME);
      serverName.resize(SQL_MAX_SQLSERVERNAME);
      SQLSMALLINT procName_len = 0;
      std::vector<SQLWCHAR> procName;
      procName.reserve(128);
      procName.resize(128);
      unsigned int lineNumber = 0;
      // Get the status records.
      SQLSMALLINT i = 1;
      errors->clear();
      while ((rc2 = SQLGetDiagRec(HandleType, handle_, i, sql_state.data(), &native_error, msg.data(), msg.capacity(), &msg_len)) != SQL_NO_DATA)
      {
        if (rc2 < 0)
        {
          break;
        }
        auto c_msg = odbcstr::trim(msg, msg_len);
        auto c_state = odbcstr::swcvec2str(sql_state, sql_state.size());
        const auto m = string(c_msg);
        SQLGetDiagField(HandleType, handle_, i, SQL_DIAG_SS_SEVERITY, &severity, SQL_IS_INTEGER, nullptr);
        SQLGetDiagField(HandleType, handle_, i, SQL_DIAG_SS_SRVNAME, serverName.data(),
                        static_cast<SQLSMALLINT>(std::min(serverName.capacity(),
                                                          static_cast<size_t>(SQL_MAX_SQLSERVERNAME))),
                        &serverName_len);
        const string c_serverName = odbcstr::trim(serverName, serverName_len);
        SQLGetDiagField(HandleType, handle_, i, SQL_DIAG_SS_PROCNAME, procName.data(), procName.capacity(), &procName_len);
        const string c_procName = odbcstr::trim(procName, procName_len);
        SQLGetDiagField(HandleType, handle_, i, SQL_DIAG_SS_LINE, &lineNumber, SQL_IS_UINTEGER, nullptr);
        if (received.find(m) == received.end())
        {
          const auto last = make_shared<OdbcError>(c_state.c_str(), c_msg.c_str(), native_error, severity, c_serverName.c_str(), c_procName.c_str(), lineNumber);
          errors->push_back(last);
          received.insert(m);
        }
        i++;
      }
    }

    SQLHANDLE get_handle() const override
    {
      return handle_;
    }

  protected:
    SQLHANDLE handle_;

  private:
    // Prevent copying
    OdbcHandleImpl(const OdbcHandleImpl &) = delete;
    OdbcHandleImpl &operator=(const OdbcHandleImpl &) = delete;
  };

  // Type definitions for concrete implementations
  using OdbcEnvironmentHandleImpl = OdbcHandleImpl<SQL_HANDLE_ENV, IOdbcEnvironmentHandle>;
  using OdbcConnectionHandleImpl = OdbcHandleImpl<SQL_HANDLE_DBC, IOdbcConnectionHandle>;
  using OdbcStatementHandleImpl = OdbcHandleImpl<SQL_HANDLE_STMT, IOdbcStatementHandle>;
  using OdbcDescriptorHandleImpl = OdbcHandleImpl<SQL_HANDLE_DESC, IOdbcDescriptorHandle>;

  // Define factory function types using std::function
  using EnvironmentHandleFactory = std::function<shared_ptr<IOdbcEnvironmentHandle>()>;
  using ConnectionHandleFactory = std::function<shared_ptr<IOdbcConnectionHandle>()>;
  using StatementHandleFactory = std::function<shared_ptr<IOdbcStatementHandle>()>;
  using DescriptorHandleFactory = std::function<shared_ptr<IOdbcDescriptorHandle>()>;

  // Declare factory functions as extern variables
  extern EnvironmentHandleFactory create_environment_handle;
  extern ConnectionHandleFactory create_connection_handle;
  extern StatementHandleFactory create_statement_handle;
  extern DescriptorHandleFactory create_descriptor_handle;

  // Updated ConnectionHandles class

}