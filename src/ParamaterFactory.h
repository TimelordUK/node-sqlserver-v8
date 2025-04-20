#pragma once

#pragma once
#include <napi.h>
#include <platform.h>
#include <mutex>
#include <string>
#include <memory>

namespace mssql
{
    class ParameterFactory {
        class QueryParameter;
        class ColumnMetadata;
    public:
        static std::shared_ptr<QueryParameter> CreateParameter(Napi::Value value, bool isOutput = false);
        static std::shared_ptr<QueryParameter> CreateParameterFromMetadata(Napi::Value value, const ColumnMetadata& metadata);
    };
}