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

    // AsyncWorker for ODBC connection operations
    class ConnectionWorker : public Napi::AsyncWorker {
    public:
        ConnectionWorker(Napi::Function& callback,
            OdbcConnection* connection,
            const std::string& connectionString,
            Connection* parent);

        // Runs on worker thread
        void Execute() override;

        // Runs on main JavaScript thread
        void OnOK() override;

    private:
        Connection* parent_;
        OdbcConnection* connection_;
        std::string connectionString_;
        // Any results or state to pass back to JavaScript
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
    
    // Helper class to store query parameters
    class QueryParameter {
    public:
        // Different constructor overloads for different parameter types
        explicit QueryParameter(const std::string& value) : stringValue_(value), type_(Type::String) {}
        explicit QueryParameter(double value) : numberValue_(value), type_(Type::Number) {}
        explicit QueryParameter(bool value) : boolValue_(value), type_(Type::Boolean) {}
        explicit QueryParameter() : type_(Type::Null) {} // For NULL values
    
        enum class Type {
            String,
            Number,
            Boolean,
            Null
        };
    
        Type getType() const { return type_; }
        const std::string& getStringValue() const { return stringValue_; }
        double getNumberValue() const { return numberValue_; }
        bool getBoolValue() const { return boolValue_; }
    
    private:
        std::string stringValue_;
        double numberValue_ = 0.0;
        bool boolValue_ = false;
        Type type_;
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