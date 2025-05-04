// In js_object_mapper.h
#pragma once
#include <napi.h>
#include "odbc_driver_types.h" // Include your C++ type definitions

namespace mssql
{

    class JsObjectMapper
    {
    public:
        // Main mapping methods
        static ProcedureParamMeta toProcedureParamMeta(const Napi::Object &jsObject);
        static NativeParam toNativeParam(const Napi::Object &jsObject);
        // static UserDefinedType toUserDefinedType(const Napi::Object &jsObject);
        // static DatabaseConnection toDatabaseConnection(const Napi::Object &jsObject);

    	// New methods for working with QueryResult and ColumnDefinition
        static Napi::Object fromColumnDefinition(const Napi::Env& env, const ColumnDefinition& colDef);
        static Napi::Array fromQueryResult(const Napi::Env& env, const QueryResult& result);
        // Reverse mapping (C++ to JS)
        static Napi::Object fromProcedureParamMeta(const Napi::Env &env, const ProcedureParamMeta &param);
        static Napi::Object fromNativeParam(const Napi::Env &env, const NativeParam &param);

    private:
        // Helper methods to reduce boilerplate
        static std::string safeGetString(const Napi::Object &obj, const std::string &prop, const std::string &defaultVal = "");
        static int64_t safeGetInt64(const Napi::Object &obj, const std::string &prop, int64_t defaultVal = 0);
        static int32_t safeGetInt32(const Napi::Object &obj, const std::string &prop, int32_t defaultVal = 0);
        static bool safeGetBool(const Napi::Object &obj, const std::string &prop, bool defaultVal = false);

        // New helper for handling variant value
        static SqlParamValue safeGetValue(const Napi::Object &obj, const std::string &prop);
        static Napi::Value fromSqlParamValue(const Napi::Env &env, const SqlParamValue &value);
    };
}