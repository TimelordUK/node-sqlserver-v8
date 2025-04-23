// In parameter_factory.cpp
#include "napi.h"
#include <platform.h>
#include "parameter_set.h"
#include "parameter_factory.h"
#include "js_object_mapper.h"
#include <iostream>

namespace mssql
{
    std::shared_ptr<ParameterSet> ParameterFactory::createParameterSet(const Napi::CallbackInfo& info)
    {
        Napi::Env env = info.Env();
        
        if (info.Length() < 1 || !info[0].IsArray()) {
            Napi::TypeError::New(env, "Expected an array of parameters").ThrowAsJavaScriptException();
            return nullptr;
        }
        
        Napi::Array jsParams = info[0].As<Napi::Array>();
        return ParameterSet::createFromJsArray(env, jsParams);
    }
    
    std::shared_ptr<QueryParameter> ParameterFactory::createParameter(const Napi::Env& env, const Napi::Value& value, int paramIndex)
    {
        // Simply delegate to the appropriate QueryParameter factory method
        return QueryParameter::createFromJs(env, value, paramIndex);
    }
}