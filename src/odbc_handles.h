#pragma once

#include "platform.h"
#include "odbc_common.h"
#include <vector>
#include <memory>

namespace mssql
{

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

        // Get errors from this handle
        // In the read_errors method of OdbcBaseHandle
        void read_errors(std::shared_ptr<std::vector<std::shared_ptr<OdbcError>>> errors)
        {
            ODBC_CHAR_TYPE sqlstate[SQL_SQLSTATE_SIZE + 1] = {0};
            ODBC_CHAR_TYPE message[SQL_MAX_MESSAGE_LENGTH + 1] = {0};
            SQLINTEGER native_error;
            SQLSMALLINT len;

            // Get all diagnostic records
            for (SQLSMALLINT i = 1;; i++)
            {
                SQLRETURN ret = ODBC_DIAG_REC(
                    HandleType,
                    handle_,
                    i,
                    sqlstate,
                    &native_error,
                    message,
                    SQL_MAX_MESSAGE_LENGTH,
                    &len);

                if (!SQL_SUCCEEDED(ret))
                {
                    break;
                }

// Convert the SQL character types to C++ strings
#ifdef PLATFORM_WINDOWS
                std::wstring wState = SQLCharToString(sqlstate, SQL_SQLSTATE_SIZE);
                std::wstring wMessage = SQLCharToString(message, len);

                // Convert wide strings to UTF-8
                std::string state = ConvertToUTF8(wState);
                std::string messageStr = ConvertToUTF8(wMessage);
#else
                std::string state = SQLCharToString(sqlstate, SQL_SQLSTATE_SIZE);
                std::string messageStr = SQLCharToString(message, len);
#endif

                // Add error to the collection
                errors->push_back(std::make_shared<OdbcError>(
                    messageStr,
                    state,
                    native_error));
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