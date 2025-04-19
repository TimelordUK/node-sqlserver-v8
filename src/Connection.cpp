#include "Connection.h"
#include "OdbcConnection.h"
#include <thread>
#include <chrono>

namespace mssql
{
    // Initialize static constructor reference
    Napi::FunctionReference Connection::constructor;

    // Initialize the class and export it to the module
    Napi::Object Connection::Init(Napi::Env env, Napi::Object exports)
    {
        // Initialize ODBC environment
        if (!OdbcConnection::InitializeEnvironment())
        {
            Napi::Error::New(env, "Failed to initialize ODBC environment")
                .ThrowAsJavaScriptException();
            return exports;
        }

        // Define class
        Napi::Function func = DefineClass(env, "Connection", { InstanceMethod("open", &Connection::Open), InstanceMethod("close", &Connection::Close) });

        // Create persistent reference to constructor
        constructor = Napi::Persistent(func);
        constructor.SuppressDestruct();

        // Export the class
        exports.Set("Connection", func);
        return exports;
    }

    // Constructor
    Connection::Connection(const Napi::CallbackInfo& info)
        : Napi::ObjectWrap<Connection>(info)
    {
        Napi::Env env = info.Env();
        Napi::HandleScope scope(env);

        // Create internal ODBC connection
        odbcConnection_ = std::make_unique<OdbcConnection>();
    }

    // Destructor
    Connection::~Connection()
    {
        // Make sure connection is closed
        if (isConnected_)
        {
            odbcConnection_->Close();
        }
    }

    // Open connection method - supports both callback and Promise
    Napi::Value Connection::Open(const Napi::CallbackInfo& info)
    {
        Napi::Env env = info.Env();
        Napi::HandleScope scope(env);

        // Check if we already have a connection
        if (isConnected_)
        {
            Napi::Error::New(env, "Connection is already open").ThrowAsJavaScriptException();
            return env.Undefined();
        }

        // Get connection string
        if (info.Length() < 1 || !info[0].IsString())
        {
            Napi::TypeError::New(env, "Connection string expected").ThrowAsJavaScriptException();
            return env.Undefined();
        }

        std::string connectionString = info[0].As<Napi::String>().Utf8Value();

        // Check for callback (last argument)
        Napi::Function callback;
        bool usePromise = false;

        if (info.Length() > 1 && info[info.Length() - 1].IsFunction())
        {
            callback = info[info.Length() - 1].As<Napi::Function>();
        }
        else
        {
            // No callback provided, we'll use a Promise
            usePromise = true;
            // Create a deferred Promise
            Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);

            // Create a callback that resolves/rejects the promise
            callback = Napi::Function::New(env, [deferred](const Napi::CallbackInfo& info)
                {
                    Napi::Env env = info.Env();
                    if (info[0].IsNull() || info[0].IsUndefined()) {
                        deferred.Resolve(info[1]);
                    }
                    else {
                        deferred.Reject(info[0]);
                    }
                    return env.Undefined(); });

            // Create and queue the worker
            auto worker = new ConnectionWorker(
                callback,
                odbcConnection_.get(),
                connectionString);
            worker->Queue();

            // Return the promise
            return deferred.Promise();
        }

        // If we got here, we're using a callback
        auto worker = new ConnectionWorker(
            callback,
            odbcConnection_.get(),
            connectionString);
        worker->Queue();

        return env.Undefined();
    }

    // Close connection method
    Napi::Value Connection::Close(const Napi::CallbackInfo& info)
    {
        Napi::Env env = info.Env();
        Napi::HandleScope scope(env);

        // Check if we have a connection to close
        if (!isConnected_)
        {
            Napi::Error::New(env, "Connection is not open").ThrowAsJavaScriptException();
            return env.Undefined();
        }

        // For simplicity, we'll do a synchronous close
        // In a full implementation, you'd likely want this to be async too
        std::string errorMessage;
        bool success = odbcConnection_->Close();

        if (!success)
        {
            Napi::Error::New(env, errorMessage).ThrowAsJavaScriptException();
            return env.Undefined();
        }

        isConnected_ = false;
        return Napi::Boolean::New(env, true);
    }

    ConnectionWorker::ConnectionWorker(Napi::Function& callback,
        OdbcConnection* connection,
        const std::string& connectionString)
        : Napi::AsyncWorker(callback),
        connection_(connection),
        connectionString_(connectionString)
    {
    }

    // This runs on the worker thread
    void ConnectionWorker::Execute()
    {
        // Attempt to open the connection to the database
        if (!connection_->Open(connectionString_))
        {
            // If failed, get error information
            const auto& errors = connection_->GetErrors();
            if (!errors.empty())
            {
                std::string errorMessage = errors[0]->message;
                SetError(errorMessage);
            }
            else
            {
                SetError("Unknown error occurred while opening connection");
            }
        }
    }

    // This runs on the main JavaScript thread
    void ConnectionWorker::OnOK()
    {
        Napi::Env env = Env();
        Napi::HandleScope scope(env);

        // Create a result object
        Napi::Object result = Napi::Object::New(env);
        result.Set("connected", Napi::Boolean::New(env, true));

        // Call the callback with null error and result
        Callback().Call({ env.Null(), result });
    }
}