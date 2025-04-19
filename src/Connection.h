#pragma once
#include <napi.h>
#include <platform.h>
#include <mutex>
#include <string>
#include <memory>

namespace mssql
{
    // Forward declaration of our internal connection class
    class OdbcConnection;

    // Main Node-API wrapper class
    class Connection : public Napi::ObjectWrap<Connection> {
    public:
        // Initialize the class and export it to the module
        static Napi::Object Init(Napi::Env env, Napi::Object exports);

        // Constructor
        Connection(const Napi::CallbackInfo& info);

        // Destructor - make sure to clean up resources
        ~Connection();

    private:
        // JavaScript-accessible methods
        Napi::Value Open(const Napi::CallbackInfo& info);
        Napi::Value Close(const Napi::CallbackInfo& info);

        // Static reference to constructor
        static Napi::FunctionReference constructor;

        // The internal ODBC connection object
        std::unique_ptr<OdbcConnection> odbcConnection_;

        // Mutex for thread safety
        std::mutex mutex_;

        // Connection state
        bool isConnected_ = false;
    };

    // AsyncWorker for ODBC connection operations
    class ConnectionWorker : public Napi::AsyncWorker {
    public:
        ConnectionWorker(Napi::Function& callback,
            OdbcConnection* connection,
            const std::string& connectionString);

        // Runs on worker thread
        void Execute() override;

        // Runs on main JavaScript thread
        void OnOK() override;

    private:
        OdbcConnection* connection_;
        std::string connectionString_;
        // Any results or state to pass back to JavaScript
    };
}