#pragma once
#include <napi.h>
#include <memory>

namespace mssql
{
    // Forward declarations
    class OdbcConnection;
    class ParameterSet;
    class QueryResult;

    class Connection : public Napi::ObjectWrap<Connection>
    {
    public:
        // Initialize the class and register it with the given exports object
        static Napi::Object Init(Napi::Env env, Napi::Object exports);
        
        // Constructor
        Connection(const Napi::CallbackInfo& info);
        
        // Destructor
        ~Connection();

    private:
        // Static reference to constructor for creating new instances
        static Napi::FunctionReference constructor;
        
        // JavaScript-accessible methods
        Napi::Value Open(const Napi::CallbackInfo& info);
        Napi::Value Close(const Napi::CallbackInfo& info);
        Napi::Value Query(const Napi::CallbackInfo& info);
        
        // Internal state
        std::unique_ptr<OdbcConnection> odbcConnection_;
        bool isConnected_ = false;
        
        // Helper method to set connection state
        inline void SetConnected(bool connected) { isConnected_ = connected; }
    };

    // Worker for executing queries asynchronously
    class QueryWorker : public Napi::AsyncWorker
    {
    public:
        QueryWorker(Napi::Function& callback, 
                  OdbcConnection* connection,
                  const std::string& sqlText,
                  const Napi::Array& params);
        
        void Execute() override;
        void OnOK() override;
        
    private:
        OdbcConnection* connection_;
        std::string sqlText_;
        std::shared_ptr<ParameterSet> parameters_;
        std::shared_ptr<QueryResult> result_;
    };
}