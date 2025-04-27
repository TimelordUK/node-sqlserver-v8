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

    SqlParamValue JsObjectMapper::safeGetValue(const Napi::Object &obj, const std::string &prop)
    {
        if (!obj.Has(prop) || obj.Get(prop).IsNull() || obj.Get(prop).IsUndefined())
        {
            return nullptr;
        }

        Napi::Value val = obj.Get(prop);

        if (val.IsBoolean())
        {
            return val.As<Napi::Boolean>().Value();
        }
        else if (val.IsNumber())
        {
            // Try to deduce if it's an integer or a float
            double dVal = val.As<Napi::Number>().DoubleValue();
            int64_t iVal = val.As<Napi::Number>().Int64Value();

            if (dVal == static_cast<double>(iVal))
            {
                // It's an integer
                if (iVal >= INT32_MIN && iVal <= INT32_MAX)
                {
                    return static_cast<int32_t>(iVal);
                }
                return iVal;
            }
            return dVal;
        }
        else if (val.IsString())
        {
            return val.As<Napi::String>().Utf8Value();
        }
        else if (val.IsBuffer())
        {
            Napi::Buffer<uint8_t> buffer = val.As<Napi::Buffer<uint8_t>>();
            return std::vector<uint8_t>(buffer.Data(), buffer.Data() + buffer.Length());
        }

        // Default to null for unsupported types
        return nullptr;
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

    NativeParam JsObjectMapper::toNativeParam(const Napi::Object &jsObject)
    {
        NativeParam result;

        result.is_user_defined = safeGetBool(jsObject, "is_user_defined");
        result.type_id = safeGetInt32(jsObject, "type_id");
        result.schema = safeGetString(jsObject, "schema");
        result.bcp = safeGetBool(jsObject, "bcp");
        result.bcp_version = safeGetInt32(jsObject, "bcp_version");
        result.table_name = safeGetString(jsObject, "table_name");
        result.ordinal_position = safeGetInt32(jsObject, "ordinal_position");
        result.scale = safeGetInt32(jsObject, "scale");
        result.offset = safeGetInt32(jsObject, "offset");
        result.precision = safeGetInt32(jsObject, "precision");
        result.is_output = safeGetBool(jsObject, "is_output");
        result.name = safeGetString(jsObject, "name");
        result.value = safeGetValue(jsObject, "value");

        return result;
    }

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

    Napi::Value JsObjectMapper::fromSqlParamValue(const Napi::Env &env, const SqlParamValue &value)
    {
        if (std::holds_alternative<std::nullptr_t>(value))
        {
            return env.Null();
        }
        else if (std::holds_alternative<bool>(value))
        {
            return Napi::Boolean::New(env, std::get<bool>(value));
        }
        else if (std::holds_alternative<int32_t>(value))
        {
            return Napi::Number::New(env, std::get<int32_t>(value));
        }
        else if (std::holds_alternative<int64_t>(value))
        {
            return Napi::Number::New(env, std::get<int64_t>(value));
        }
        else if (std::holds_alternative<double>(value))
        {
            return Napi::Number::New(env, std::get<double>(value));
        }
        else if (std::holds_alternative<std::string>(value))
        {
            return Napi::String::New(env, std::get<std::string>(value));
        }
        else if (std::holds_alternative<std::vector<uint8_t>>(value))
        {
            const auto &vec = std::get<std::vector<uint8_t>>(value);
            return Napi::Buffer<uint8_t>::Copy(env, vec.data(), vec.size());
        }

        return env.Null();
    }

    Napi::Object JsObjectMapper::fromNativeParam(const Napi::Env &env, const NativeParam &param)
    {
        Napi::Object result = Napi::Object::New(env);

        result.Set("is_user_defined", Napi::Boolean::New(env, param.is_user_defined));
        result.Set("type_id", Napi::Number::New(env, param.type_id));
        result.Set("schema", Napi::String::New(env, param.schema));
        result.Set("bcp", Napi::Boolean::New(env, param.bcp));
        result.Set("bcp_version", Napi::Number::New(env, param.bcp_version));
        result.Set("table_name", Napi::String::New(env, param.table_name));
        result.Set("ordinal_position", Napi::Number::New(env, param.ordinal_position));
        result.Set("scale", Napi::Number::New(env, param.scale));
        result.Set("offset", Napi::Number::New(env, param.offset));
        result.Set("precision", Napi::Number::New(env, param.precision));
        result.Set("is_output", Napi::Boolean::New(env, param.is_output));
        result.Set("name", Napi::String::New(env, param.name));
        result.Set("value", fromSqlParamValue(env, param.value));

        return result;
    }
}