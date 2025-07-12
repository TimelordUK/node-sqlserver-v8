#include <napi.h>
#include "include/utils/Logger.h"
#include "include/js/Connection.h"
#include "include/common/platform.h"

static Napi::Value SetLogLevel(const Napi::CallbackInfo &info)
{
  const Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsNumber())
  {
    Napi::TypeError::New(env, "Number expected for log level").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  int level = info[0].As<Napi::Number>().Int32Value();
  if (level < 0 || level > 5)
  {
    Napi::RangeError::New(env, "Log level must be between 0 and 5").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  mssql::Logger::GetInstance().SetLogLevel(static_cast<mssql::LogLevel>(level));
  return env.Undefined();
}

static Napi::Value EnableConsoleLogging(const Napi::CallbackInfo &info)
{
  const Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsBoolean())
  {
    Napi::TypeError::New(env, "Boolean expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  const bool enabled = info[0].As<Napi::Boolean>().Value();
  mssql::Logger::GetInstance().SetLogToConsole(enabled);
  return env.Undefined();
}

static Napi::Value SetLogFile(const Napi::CallbackInfo &info)
{
  const Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString())
  {
    Napi::TypeError::New(env, "String expected for log file path").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  const std::string filePath = info[0].As<Napi::String>().Utf8Value();
  mssql::Logger::GetInstance().SetLogToFile(filePath);
  return env.Undefined();
}

// Initialize the module
Napi::Object InitModule(Napi::Env env, Napi::Object exports)
{
  // Initialize platform-specific signal handlers
  Platform::InitializeSignalHandlers();

  // Initialize and export the Connection class
  mssql::Connection::Init(env, exports);
  exports.Set("setLogLevel", Napi::Function::New(env, SetLogLevel));
  exports.Set("enableConsoleLogging", Napi::Function::New(env, EnableConsoleLogging));
  exports.Set("setLogFile", Napi::Function::New(env, SetLogFile));
  return exports;
}

// Register the module
NODE_API_MODULE(sqlserver, InitModule)