#include <napi.h>
#include "Connection.h"

// Initialize the module
Napi::Object InitModule(Napi::Env env, Napi::Object exports) {
    // Initialize and export the Connection class
    mssql::Connection::Init(env, exports);

    return exports;
}

// Register the module
NODE_API_MODULE(sqlserver, InitModule)