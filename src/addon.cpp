// In your main module file (e.g., sqlserver.cpp)

#include "stdafx.h"
#include "Connection.h"
// Include other necessary headers

// Module initialization
#ifdef CONNECTION_USE_NODE_API
// If Connection uses Node-API but other classes use NAN
Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
    // Initialize Connection with Node-API
    mssql::Connection::Init(env, exports);

    // For other classes still using NAN, we need to adapt them
    // This is where adapter code would go if needed

    return exports;
}

NODE_API_MODULE(sqlserver, InitAll)

#else
// Standard NAN initialization
NAN_MODULE_INIT(InitAll) {
    // Initialize Connection with NAN
    mssql::Connection::Init(target);

    // Initialize other classes as needed
}

NODE_MODULE(sqlserver, InitAll)
#endif