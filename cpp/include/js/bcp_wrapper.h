#pragma once

#include <napi.h>
#include <memory>
#include "odbc/bcp_executor.h"

namespace mssql {

class BcpWrapper : public Napi::ObjectWrap<BcpWrapper> {
private:
    std::shared_ptr<BcpExecutor> executor;
    
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    
    // Constructor
    BcpWrapper(const Napi::CallbackInfo& info);
    
    // JavaScript methods
    Napi::Value init(const Napi::CallbackInfo& info);
    Napi::Value bindColumn(const Napi::CallbackInfo& info);
    Napi::Value execute(const Napi::CallbackInfo& info);
    Napi::Value getRowCount(const Napi::CallbackInfo& info);
    
    // Factory
    static Napi::Object NewInstance(Napi::Env env, std::shared_ptr<BcpExecutor> exec);
    
private:
    static Napi::FunctionReference constructor;
};

}