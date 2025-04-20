#pragma once

#include "platform.h"
#include "odbc_common.h"
#include <vector>
#include <set>
#include <memory>

namespace mssql
{
    using namespace std;
    // Forward declarations
    class OdbcError;

    // Base class for ODBC handles with RAII semantics
    template <SQLSMALLINT HandleType>
    class OdbcBaseHandle
    {
    public:
        OdbcBaseHandle() : handle_(SQL_NULL_HANDLE) {}

        ~OdbcBaseHandle()
        {
            free();
        }

        bool alloc(SQLHANDLE parent = SQL_NULL_HANDLE)
        {
            free();
            SQLRETURN ret = SQLAllocHandle(HandleType, parent, &handle_);
            return SQL_SUCCEEDED(ret);
        }

        void free()
        {
            if (handle_ != SQL_NULL_HANDLE)
            {
                SQLFreeHandle(HandleType, handle_);
                handle_ = SQL_NULL_HANDLE;
            }
        }

        void read_errors(shared_ptr<vector<shared_ptr<OdbcError>>> & errors) const
        {
            SQLSMALLINT msg_len = 0;
            SQLRETURN      rc2;
            SQLINTEGER    native_error = 0;
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
            while ((rc2 = SQLGetDiagRec(HandleType, handle_, i,  sql_state.data(), &native_error, msg.data(), msg.capacity(), &msg_len)) != SQL_NO_DATA) {
                if (rc2 < 0) {
                    break;
                }
                auto c_msg = odbcstr::trim(msg, msg_len);
                auto c_state = odbcstr::swcvec2str(sql_state, sql_state.size());
                const auto m = string(c_msg);
                SQLGetDiagField(HandleType, handle_, i, SQL_DIAG_SS_SEVERITY, &severity, SQL_IS_INTEGER, nullptr);
                SQLGetDiagField(HandleType, handle_, i, SQL_DIAG_SS_SRVNAME, serverName.data(), serverName.capacity(), &serverName_len);
                const string c_serverName = odbcstr::trim(serverName, serverName_len);
                SQLGetDiagField(HandleType, handle_, i, SQL_DIAG_SS_PROCNAME, procName.data(), procName.capacity(), &procName_len);
                const string c_procName = odbcstr::trim(procName, procName_len);
                SQLGetDiagField(HandleType, handle_, i, SQL_DIAG_SS_LINE, &lineNumber, SQL_IS_UINTEGER, nullptr);
                if (received.find(m) == received.end()) {
                    const auto last = make_shared<OdbcError>(c_state.c_str(), c_msg.c_str(), native_error, severity, c_serverName.c_str(), c_procName.c_str(), lineNumber);
                    errors->push_back(last);
                    received.insert(m);
                }
                i++;
            }
        }

        // Implicit conversion to SQLHANDLE
        operator SQLHANDLE() const { return handle_; }

    protected:
        SQLHANDLE handle_;

    private:
        // Prevent copying
        OdbcBaseHandle(const OdbcBaseHandle &) = delete;
        OdbcBaseHandle &operator=(const OdbcBaseHandle &) = delete;
    };

    // Specialized handle types
    using OdbcEnvironmentHandle = OdbcBaseHandle<SQL_HANDLE_ENV>;
    using OdbcConnectionHandle = OdbcBaseHandle<SQL_HANDLE_DBC>;
    using OdbcStatementHandle = OdbcBaseHandle<SQL_HANDLE_STMT>;
    using OdbcDescriptorHandle = OdbcBaseHandle<SQL_HANDLE_DESC>;



    class ConnectionHandles_ {
    public:
        // Constructor accepting raw SQLHENV
        ConnectionHandles_(SQLHENV env) : envHandle(env) {
            SQLAllocHandle(SQL_HANDLE_DBC, env, &conHandle);
        }

        // Constructor accepting OdbcEnvironmentHandle reference
        ConnectionHandles_(const OdbcEnvironmentHandle& env)
            : envHandle(static_cast<SQLHENV>(env)) {
            SQLAllocHandle(SQL_HANDLE_DBC, envHandle, &conHandle);
        }

        // Constructor accepting shared_ptr to OdbcEnvironmentHandle
        ConnectionHandles_(const std::shared_ptr<OdbcEnvironmentHandle>& env)
            : envHandle(env ? static_cast<SQLHENV>(*env) : SQL_NULL_HANDLE) {
            if (envHandle != SQL_NULL_HANDLE) {
                SQLAllocHandle(SQL_HANDLE_DBC, envHandle, &conHandle);
            }
        }

        // Rest of the class...

    private:
        SQLHENV envHandle;
        SQLHDBC conHandle = SQL_NULL_HANDLE;
    };



    // Class to manage connection handles
    class ConnectionHandles {
    public:
        ConnectionHandles(SQLHENV env) : envHandle_(env) {
            connectionHandle_.alloc(env);
        }

        ~ConnectionHandles() {
            clear();
        }

        void clear() {
            connectionHandle_.free();
        }

        // Return a pointer to the connection handle instead of making a copy
        OdbcConnectionHandle* connectionHandle() {
            return &connectionHandle_;
        }

    private:
        SQLHENV envHandle_;
        OdbcConnectionHandle connectionHandle_;
    };
}