// In js_object_mapper.cpp
#include "js_object_mapper.h"

namespace mssql
{

    // Helper methods implementation
    std::string JsObjectMapper::safeGetString(const Napi::Object &obj, const std::string &prop, const std::string &defaultVal)
    {
        if (obj.Has(prop) && obj.Get(prop).IsString())
        {
            return obj.Get(prop).As<Napi::String>().Utf8Value();
        }
        return defaultVal;
    }

    int64_t JsObjectMapper::safeGetInt64(const Napi::Object &obj, const std::string &prop, int64_t defaultVal)
    {
        if (obj.Has(prop) && obj.Get(prop).IsNumber())
        {
            return obj.Get(prop).As<Napi::Number>().Int64Value();
        }
        return defaultVal;
    }

    int32_t JsObjectMapper::safeGetInt32(const Napi::Object &obj, const std::string &prop, int32_t defaultVal)
    {
        if (obj.Has(prop) && obj.Get(prop).IsNumber())
        {
            return obj.Get(prop).As<Napi::Number>().Int32Value();
        }
        return defaultVal;
    }

    bool JsObjectMapper::safeGetBool(const Napi::Object &obj, const std::string &prop, bool defaultVal)
    {
        if (obj.Has(prop) && obj.Get(prop).IsBoolean())
        {
            return obj.Get(prop).As<Napi::Boolean>().Value();
        }
        return defaultVal;
    }

    // Main mapper implementation
    ProcedureParamMeta JsObjectMapper::toProcedureParamMeta(const Napi::Object &jsObject)
    {
        ProcedureParamMeta result;

        result.proc_name = safeGetString(jsObject, "proc_name");
        result.type_desc = safeGetString(jsObject, "type_desc");
        result.object_id = safeGetInt64(jsObject, "object_id");
        result.has_default_value = safeGetBool(jsObject, "has_default_value");
        result.default_value = safeGetString(jsObject, "default_value");
        result.is_output = safeGetBool(jsObject, "is_output");
        result.name = safeGetString(jsObject, "name");
        result.type_id = safeGetString(jsObject, "type_id");
        result.max_length = safeGetInt32(jsObject, "max_length");
        result.order = safeGetInt32(jsObject, "order");
        result.collation = safeGetString(jsObject, "collation");
        result.is_user_defined = safeGetBool(jsObject, "is_user_defined");

        return result;
    }

    // Other mappers follow similar patterns...

    Napi::Object JsObjectMapper::fromProcedureParamMeta(const Napi::Env &env, const ProcedureParamMeta &param)
    {
        Napi::Object result = Napi::Object::New(env);

        result.Set("proc_name", Napi::String::New(env, param.proc_name));
        result.Set("type_desc", Napi::String::New(env, param.type_desc));
        result.Set("object_id", Napi::Number::New(env, param.object_id));
        result.Set("has_default_value", Napi::Boolean::New(env, param.has_default_value));
        result.Set("default_value", Napi::String::New(env, param.default_value));
        result.Set("is_output", Napi::Boolean::New(env, param.is_output));
        result.Set("name", Napi::String::New(env, param.name));
        result.Set("type_id", Napi::String::New(env, param.type_id));
        result.Set("max_length", Napi::Number::New(env, param.max_length));
        result.Set("order", Napi::Number::New(env, param.order));
        result.Set("collation", Napi::String::New(env, param.collation));
        result.Set("is_user_defined", Napi::Boolean::New(env, param.is_user_defined));

        return result;
    }
}