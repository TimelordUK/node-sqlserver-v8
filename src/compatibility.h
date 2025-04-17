// compatibility.h
#pragma once

// Common includes for both implementations
#include <memory>
#include <string>

// For Connection class specifically
#ifdef CONNECTION_USE_NODE_API
  #include <napi.h>

  // Define helpful macros for conversions
  namespace mssql {
    // Helper function to convert Node-API values to V8 equivalents when needed
    inline v8::Local<v8::Value> ConvertToV8(Napi::Value value) {
      // This is a simplification - actual implementation would be more complex
      return v8::Local<v8::Value>::Cast(reinterpret_cast<v8::Value*>(*value));
    }

    // Helper function to convert V8 values to Node-API equivalents when needed
    inline Napi::Value ConvertToNapi(v8::Local<v8::Value> value, Napi::Env env) {
      // This is a simplification - actual implementation would be more complex
      return Napi::Value(env, reinterpret_cast<napi_value>(*value));
    }
  }
#else
  #include <nan.h>
#endif