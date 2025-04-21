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
    class QueryParameter;
    class QueryResult;

    // Main Node-API wrapper class
    class Connection : public Napi::ObjectWrap<Connection> {
    public:
        // Initialize the class and export it to the module
        static Napi::Object Init(Napi::Env env, Napi::Object exports);
        void SetConnected(bool connected) { isConnected_ = connected; }
        // Constructor
        Connection(const Napi::CallbackInfo& info);

        // Destructor - make sure to clean up resources
        ~Connection();

    private:
        // JavaScript-accessible methods
        Napi::Value Open(const Napi::CallbackInfo& info);
        Napi::Value Close(const Napi::CallbackInfo& info);
        Napi::Value Query(const Napi::CallbackInfo& info); 

        // Static reference to constructor
        static Napi::FunctionReference constructor;

        // The internal ODBC connection object
        std::unique_ptr<OdbcConnection> odbcConnection_;

        // Mutex for thread safety
        std::mutex mutex_;

        // Connection state
        bool isConnected_ = false;
    };

    

    // In Connection.h after ConnectionWorker class
class QueryWorker : public Napi::AsyncWorker {
    public:
        QueryWorker(Napi::Function& callback,
            OdbcConnection* connection,
            const std::string& sqlText,
            const Napi::Array& params);
    
        // Runs on worker thread
        void Execute() override;
    
        // Runs on main JavaScript thread
        void OnOK() override;
    
    private:
        OdbcConnection* connection_;
        std::string sqlText_;
        std::vector<std::shared_ptr<QueryParameter>> parameters_;
        std::shared_ptr<QueryResult> result_;
    };
    
   
    
    // Helper class to store query results
    class QueryResult {
    public:
        // Methods to add columns and rows
        void addColumn(const std::string& name, int sqlType) {
            columns_.push_back({name, sqlType});
        }
    
        void addRow(const std::vector<std::string>& rowData) {
            rows_.push_back(rowData);
        }
    
        // Method to convert to JavaScript object
        Napi::Object toJSObject(Napi::Env env) const;
    
    private:
        struct Column {
            std::string name;
            int sqlType;
        };
        std::vector<Column> columns_;
        std::vector<std::vector<std::string>> rows_;
    };
}