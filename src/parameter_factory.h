#pragma once

#pragma once
#include <napi.h>
#include <platform.h>
#include <mutex>
#include <string>
#include <memory>


namespace mssql
{
    class ParameterInfo
    {
    public:
        enum class InputType
        {
            Scalar,
            Array,
            MetadataObject,
            Null
        };

        enum class ValueType
        {
            String,
            Number,
            Int32,
            UInt32,
            Boolean,
            Date,
            Buffer,
            Null,
            Unknown
        };

        ParameterInfo(Napi::Value value)
        {
            determineTypes(value);
        }

        InputType getInputType() const { return inputType; }
        ValueType getValueType() const { return valueType; }
        bool isArray() const { return inputType == InputType::Array; }
        bool isMetadata() const { return inputType == InputType::MetadataObject; }

    private:
        InputType inputType = InputType::Null;
        ValueType valueType = ValueType::Null;

        void determineTypes(Napi::Value value)
        {
            if (value.IsNull() || value.IsUndefined())
            {
                inputType = InputType::Null;
                valueType = ValueType::Null;
                return;
            }

            if (value.IsArray())
            {
                inputType = InputType::Array;
                // Sample first element of array to determine element type
                auto array = value.As<Napi::Array>();
                if (array.Length() > 0)
                {
                    auto firstElement = array.Get(uint32_t(0));
                    valueType = determineValueType(firstElement);
                }
                return;
            }

            if (value.IsObject() && !value.IsBuffer() && !value.IsDate())
            {
                // Check if this is a metadata object
                auto obj = value.As<Napi::Object>();
                if (obj.Has("sql_type") || obj.Has("is_output") || obj.Has("type_id"))
                {
                    inputType = InputType::MetadataObject;
                    return;
                }
            }

            // Must be a scalar value
            inputType = InputType::Scalar;
            valueType = determineValueType(value);
        }

        ValueType determineValueType(Napi::Value value)
        {
            if (value.IsString())
                return ValueType::String;
            if (value.IsNumber())
            {
                // For N-API, we need to check integer types differently
                // We can try to get the value as int32/uint32 and check if it succeeds
                if (value.IsNumber())
                {
                    // Check if it can be exactly represented as Int32
                    double numValue = value.As<Napi::Number>().DoubleValue();
                    if (numValue == static_cast<int32_t>(numValue) &&
                        numValue >= std::numeric_limits<int32_t>::min() &&
                        numValue <= std::numeric_limits<int32_t>::max())
                    {
                        return ValueType::Int32;
                    }

                    // Check if it can be exactly represented as UInt32
                    if (numValue == static_cast<uint32_t>(numValue) &&
                        numValue >= 0 &&
                        numValue <= std::numeric_limits<uint32_t>::max())
                    {
                        return ValueType::UInt32;
                    }

                    // Otherwise it's a general Number
                    return ValueType::Number;
                }
            }
            if (value.IsBoolean())
                return ValueType::Boolean;
            if (value.IsDate())
                return ValueType::Date;
            if (value.IsBuffer())
                return ValueType::Buffer;
            if (value.IsNull() || value.IsUndefined())
                return ValueType::Null;
            return ValueType::Unknown;
        }
    };

    class QueryParameter;
    class ColumnMetadata;
    class ParameterSet;

    class ParameterFactory
    {
    public:
        static bool populateParameterSet(const Napi::Array &params, std::shared_ptr<ParameterSet> set);
        // static std::shared_ptr<QueryParameter> CreateParameter(Napi::Value value, bool isOutput = false);
        // static std::shared_ptr<QueryParameter> CreateParameterFromMetadata(Napi::Value value, const ColumnMetadata& metadata);
    };
}