// In query_parameter.cpp
#include <platform.h>
#include <napi.h>
#include "query_parameter.h"
#include "js_object_mapper.h"
#include <iostream>
#include <stdexcept>

namespace mssql
{
    // QueryParameter implementation

    QueryParameter::QueryParameter(int index)
        : index_(index),
          sql_type_(SQL_UNKNOWN_TYPE),
          c_type_(SQL_C_DEFAULT),
          param_type_(SQL_PARAM_INPUT),
          param_size_(0),
          decimal_digits_(0),
          indicator_(SQL_NULL_DATA),
          element_count_(1),
          bind_type_(BindType::SINGLE),
          single_value_(nullptr),
          indicators_(nullptr),
          owns_storage_(true)
    {
    }

    std::shared_ptr<QueryParameter> QueryParameter::createFromJs(const Napi::Env& env, const Napi::Value& value, int paramIndex)
    {
        auto param = std::make_shared<QueryParameter>(paramIndex);
        
        if (value.IsNull() || value.IsUndefined()) {
            // Handle null/undefined values
            param->sql_type_ = SQL_VARCHAR;
            param->c_type_ = SQL_C_CHAR;
            param->indicator_ = SQL_NULL_DATA;
            param->param_size_ = 1;
            param->single_value_ = new SqlParamValue(nullptr);
        }
        else if (value.IsObject() && !value.IsArray() && !value.IsBuffer()) {
            // This might be a NativeParam object
            Napi::Object obj = value.As<Napi::Object>();
            
            // Check if this object has the expected properties of a NativeParam
            if (obj.Has("name") && obj.Has("type_id")) {
                NativeParam nativeParam = JsObjectMapper::toNativeParam(obj);
                return createFromNativeParam(nativeParam, paramIndex);
            }
            else {
                // Generic object, convert to string
                std::string str = value.ToString().Utf8Value();
                param->sql_type_ = SQL_VARCHAR;
                param->c_type_ = SQL_C_CHAR;
                param->param_size_ = str.length() + 1;
                param->single_value_ = new SqlParamValue(str);
            }
        }
        else if (value.IsArray()) {
            // Handle array values
            return createFromArray(env, value.As<Napi::Array>(), paramIndex);
        }
        else {
            // Handle primitive types
            param->inferTypeInfo(value);
            if (value.IsString()) {
                std::string str = value.As<Napi::String>().Utf8Value();
                param->param_size_ = str.length() + 1;
                param->single_value_ = new SqlParamValue(str);
            }
            else if (value.IsNumber()) {
                double dVal = value.As<Napi::Number>().DoubleValue();
                int64_t iVal = value.As<Napi::Number>().Int64Value();
                
                if (dVal == static_cast<double>(iVal)) {
                    // It's an integer
                    if (iVal >= INT32_MIN && iVal <= INT32_MAX) {
                        param->single_value_ = new SqlParamValue(static_cast<int32_t>(iVal));
                    } else {
                        param->single_value_ = new SqlParamValue(iVal);
                    }
                } else {
                    param->single_value_ = new SqlParamValue(dVal);
                }
            }
            else if (value.IsBoolean()) {
                param->single_value_ = new SqlParamValue(value.As<Napi::Boolean>().Value());
            }
            else if (value.IsBuffer()) {
                Napi::Buffer<uint8_t> buffer = value.As<Napi::Buffer<uint8_t>>();
                std::vector<uint8_t> data(buffer.Data(), buffer.Data() + buffer.Length());
                param->param_size_ = data.size();
                param->single_value_ = new SqlParamValue(std::move(data));
            }
            else {
                // Unsupported type, convert to string
                std::string str = value.ToString().Utf8Value();
                param->sql_type_ = SQL_VARCHAR;
                param->c_type_ = SQL_C_CHAR;
                param->param_size_ = str.length() + 1;
                param->single_value_ = new SqlParamValue(str);
            }
            
            param->indicator_ = SQL_NTS;  // For string, or actual length for binary
        }
        
        return param;
    }

    std::shared_ptr<QueryParameter> QueryParameter::createFromNativeParam(const NativeParam& param, int paramIndex)
    {
        auto queryParam = std::make_shared<QueryParameter>(paramIndex);
        
        // Copy metadata
        queryParam->metadata_ = param;
        queryParam->name_ = param.name;
        
        // Set SQL type based on type_id
        queryParam->sql_type_ = param.type_id;
        
        // Determine C type based on SQL type
        switch (param.type_id) {
            case SQL_CHAR:
            case SQL_VARCHAR:
            case SQL_LONGVARCHAR:
                queryParam->c_type_ = SQL_C_CHAR;
                break;
            case SQL_WCHAR:
            case SQL_WVARCHAR:
            case SQL_WLONGVARCHAR:
                queryParam->c_type_ = SQL_C_WCHAR;
                break;
            case SQL_DECIMAL:
            case SQL_NUMERIC:
                queryParam->c_type_ = SQL_C_CHAR;  // Use string for decimals
                break;
            case SQL_SMALLINT:
                queryParam->c_type_ = SQL_C_SSHORT;
                break;
            case SQL_INTEGER:
                queryParam->c_type_ = SQL_C_SLONG;
                break;
            case SQL_BIGINT:
                queryParam->c_type_ = SQL_C_SBIGINT;
                break;
            case SQL_REAL:
                queryParam->c_type_ = SQL_C_FLOAT;
                break;
            case SQL_FLOAT:
            case SQL_DOUBLE:
                queryParam->c_type_ = SQL_C_DOUBLE;
                break;
            case SQL_BIT:
                queryParam->c_type_ = SQL_C_BIT;
                break;
            case SQL_TINYINT:
                queryParam->c_type_ = SQL_C_TINYINT;
                break;
            case SQL_BINARY:
            case SQL_VARBINARY:
            case SQL_LONGVARBINARY:
                queryParam->c_type_ = SQL_C_BINARY;
                break;
            case SQL_TYPE_DATE:
                queryParam->c_type_ = SQL_C_TYPE_DATE;
                break;
            case SQL_TYPE_TIME:
                queryParam->c_type_ = SQL_C_TYPE_TIME;
                break;
            case SQL_TYPE_TIMESTAMP:
                queryParam->c_type_ = SQL_C_TYPE_TIMESTAMP;
                break;
            default:
                queryParam->c_type_ = SQL_C_CHAR;  // Default to string
                break;
        }
        
        // Set parameter type
        queryParam->param_type_ = param.is_output ? SQL_PARAM_OUTPUT : SQL_PARAM_INPUT;
        
        // Set precision and scale
        queryParam->param_size_ = param.precision;
        queryParam->decimal_digits_ = param.scale;
        
        // Store the value
        queryParam->single_value_ = new SqlParamValue(param.value);
        
        // Set bind type
        queryParam->bind_type_ = BindType::OBJECT;
        
        return queryParam;
    }

    std::shared_ptr<QueryParameter> QueryParameter::createFromArray(const Napi::Env& env, const Napi::Array& array, int paramIndex)
    {
        auto param = std::make_shared<QueryParameter>(paramIndex);
        param->bind_type_ = BindType::ARRAY;
        param->element_count_ = array.Length();
        
        if (array.Length() == 0) {
            // Empty array
            param->sql_type_ = SQL_VARCHAR;
            param->c_type_ = SQL_C_CHAR;
            param->array_values_ = new std::vector<SqlParamValue>();
            param->indicators_ = new std::vector<SQLLEN>();
            return param;
        }
        
        // Infer type from first element
        Napi::Value firstElement = array.Get(static_cast<uint32_t>(0));
        param->inferTypeInfo(firstElement);
        
        // Allocate storage for values and indicators
        param->array_values_ = new std::vector<SqlParamValue>();
        param->indicators_ = new std::vector<SQLLEN>(array.Length(), SQL_NULL_DATA);
        
        // Process all elements
        for (uint32_t i = 0; i < array.Length(); i++) {
            Napi::Value elem = array.Get(i);
            
            if (elem.IsNull() || elem.IsUndefined()) {
                param->array_values_->push_back(nullptr);
                (*param->indicators_)[i] = SQL_NULL_DATA;
                continue;
            }
            
            // Convert based on the type of the first element
            if (firstElement.IsString()) {
                std::string str = elem.ToString().Utf8Value();
                param->array_values_->push_back(str);
                (*param->indicators_)[i] = str.length();
                param->param_size_ = std::max(param->param_size_, (SQLULEN)(str.length() + 1));
            }
            else if (firstElement.IsNumber()) {
                if (param->c_type_ == SQL_C_DOUBLE) {
                    param->array_values_->push_back(elem.As<Napi::Number>().DoubleValue());
                }
                else if (param->c_type_ == SQL_C_SLONG) {
                    param->array_values_->push_back(static_cast<int32_t>(elem.As<Napi::Number>().Int32Value()));
                }
                else {
                    param->array_values_->push_back(elem.As<Napi::Number>().Int64Value());
                }
                (*param->indicators_)[i] = sizeof(double);  // Worst case
            }
            else if (firstElement.IsBoolean()) {
                param->array_values_->push_back(elem.As<Napi::Boolean>().Value());
                (*param->indicators_)[i] = sizeof(bool);
            }
            else if (firstElement.IsBuffer()) {
                Napi::Buffer<uint8_t> buffer = elem.As<Napi::Buffer<uint8_t>>();
                std::vector<uint8_t> data(buffer.Data(), buffer.Data() + buffer.Length());
                param->array_values_->push_back(std::move(data));
                (*param->indicators_)[i] = buffer.Length();
                param->param_size_ = std::max(param->param_size_, (SQLULEN)buffer.Length());
            }
            else {
                // Unsupported type, convert to string
                std::string str = elem.ToString().Utf8Value();
                param->array_values_->push_back(str);
                (*param->indicators_)[i] = str.length();
                param->param_size_ = std::max(param->param_size_, (SQLULEN)(str.length() + 1));
            }
        }
        
        return param;
    }

    SQLSMALLINT QueryParameter::mapJsToSqlType(const Napi::Value& value)
    {
        if (value.IsString()) {
            return SQL_VARCHAR;
        }
        else if (value.IsNumber()) {
            // Check if integer or float
            double dVal = value.As<Napi::Number>().DoubleValue();
            int64_t iVal = value.As<Napi::Number>().Int64Value();
            
            if (dVal == static_cast<double>(iVal)) {
                // Integer
                return SQL_INTEGER;
            }
            else {
                // Float
                return SQL_DOUBLE;
            }
        }
        else if (value.IsBoolean()) {
            return SQL_BIT;
        }
        else if (value.IsBuffer()) {
            return SQL_VARBINARY;
        }
        else if (value.IsDate()) {
            return SQL_TYPE_TIMESTAMP;
        }
        else {
            // Default
            return SQL_VARCHAR;
        }
    }

    SQLSMALLINT QueryParameter::mapJsToSqlCType(const Napi::Value& value)
    {
        if (value.IsString()) {
            return SQL_C_CHAR;
        }
        else if (value.IsNumber()) {
            // Check if integer or float
            double dVal = value.As<Napi::Number>().DoubleValue();
            int64_t iVal = value.As<Napi::Number>().Int64Value();
            
            if (dVal == static_cast<double>(iVal)) {
                // Integer
                if (iVal >= INT32_MIN && iVal <= INT32_MAX) {
                    return SQL_C_SLONG;
                }
                else {
                    return SQL_C_SBIGINT;
                }
            }
            else {
                // Float
                return SQL_C_DOUBLE;
            }
        }
        else if (value.IsBoolean()) {
            return SQL_C_BIT;
        }
        else if (value.IsBuffer()) {
            return SQL_C_BINARY;
        }
        else if (value.IsDate()) {
            return SQL_C_TYPE_TIMESTAMP;
        }
        else {
            // Default
            return SQL_C_CHAR;
        }
    }

    void QueryParameter::inferTypeInfo(const Napi::Value& value)
    {
        sql_type_ = mapJsToSqlType(value);
        c_type_ = mapJsToSqlCType(value);
        
        // Set defaults for parameter size
        switch (c_type_) {
            case SQL_C_CHAR:
                param_size_ = 1;  // Will be updated when setting the value
                break;
            case SQL_C_WCHAR:
                param_size_ = 2;  // Will be updated when setting the value
                break;
            case SQL_C_BINARY:
                param_size_ = 1;  // Will be updated when setting the value
                break;
            case SQL_C_BIT:
                param_size_ = sizeof(unsigned char);
                break;
            case SQL_C_TINYINT:
            case SQL_C_STINYINT:
            case SQL_C_UTINYINT:
                param_size_ = sizeof(char);
                break;
            case SQL_C_SHORT:
            case SQL_C_SSHORT:
            case SQL_C_USHORT:
                param_size_ = sizeof(short);
                break;
            case SQL_C_LONG:
            case SQL_C_SLONG:
            case SQL_C_ULONG:
                param_size_ = sizeof(long);
                break;
            case SQL_C_FLOAT:
                param_size_ = sizeof(float);
                break;
            case SQL_C_DOUBLE:
                param_size_ = sizeof(double);
                break;
            case SQL_C_SBIGINT:
            case SQL_C_UBIGINT:
                param_size_ = sizeof(int64_t);
                break;
            case SQL_C_TYPE_DATE:
                param_size_ = sizeof(SQL_DATE_STRUCT);
                break;
            case SQL_C_TYPE_TIME:
                param_size_ = sizeof(SQL_TIME_STRUCT);
                break;
            case SQL_C_TYPE_TIMESTAMP:
                param_size_ = sizeof(SQL_TIMESTAMP_STRUCT);
                break;
            default:
                param_size_ = sizeof(double);  // Default
                break;
        }
    }

    SQLRETURN QueryParameter::bind(SQLHSTMT hstmt)
    {
        if (bind_type_ == BindType::SINGLE) {
            bindSingleValue(hstmt);
        }
        else if (bind_type_ == BindType::ARRAY) {
            bindArrayValue(hstmt);
        }
        else if (bind_type_ == BindType::OBJECT) {
            // Similar to single value binding but uses metadata
            bindSingleValue(hstmt);
        }
        else if (bind_type_ == BindType::TVP) {
            // TVP binding will be implemented later
            throw std::runtime_error("TVP binding not yet implemented");
        }
        
        return SQL_SUCCESS;
    }

    void QueryParameter::bindSingleValue(SQLHSTMT hstmt)
    {
        SQLPOINTER value_ptr = nullptr;
        
        // Prepare the value pointer based on the stored value type
        if (single_value_ != nullptr) {
            if (std::holds_alternative<std::nullptr_t>(*single_value_)) {
                indicator_ = SQL_NULL_DATA;
            }
            else if (std::holds_alternative<bool>(*single_value_)) {
                value_ptr = &std::get<bool>(*single_value_);
                indicator_ = sizeof(bool);
            }
            else if (std::holds_alternative<int32_t>(*single_value_)) {
                value_ptr = &std::get<int32_t>(*single_value_);
                indicator_ = sizeof(int32_t);
            }
            else if (std::holds_alternative<int64_t>(*single_value_)) {
                value_ptr = &std::get<int64_t>(*single_value_);
                indicator_ = sizeof(int64_t);
            }
            else if (std::holds_alternative<double>(*single_value_)) {
                value_ptr = &std::get<double>(*single_value_);
                indicator_ = sizeof(double);
            }
            else if (std::holds_alternative<std::string>(*single_value_)) {
                const std::string& str = std::get<std::string>(*single_value_);
                value_ptr = const_cast<char*>(str.c_str());
                indicator_ = SQL_NTS;
            }
            else if (std::holds_alternative<std::vector<uint8_t>>(*single_value_)) {
                const std::vector<uint8_t>& data = std::get<std::vector<uint8_t>>(*single_value_);
                value_ptr = const_cast<uint8_t*>(data.data());
                indicator_ = data.size();
            }
        }
        
        SQLRETURN ret = SQLBindParameter(
            hstmt,                // Statement handle
            index_,               // Parameter number (1-based)
            param_type_,          // Input/output type
            c_type_,              // C data type
            sql_type_,            // SQL data type
            param_size_,          // Column size
            decimal_digits_,      // Decimal digits
            value_ptr,            // Parameter value pointer
            0,                    // Buffer length (not used for single values)
            &indicator_           // Indicator value
        );
        
        if (ret != SQL_SUCCESS && ret != SQL_SUCCESS_WITH_INFO) {
            // Handle error
            std::cerr << "Error binding parameter " << index_ << " with ret code " << ret << std::endl;
        }
    }

    void QueryParameter::bindArrayValue(SQLHSTMT hstmt)
    {
        // Array binding requires more complex handling
        // This is a simplified version - actual implementation would need to
        // handle different data types correctly
        
        // For array binding, we need contiguous memory for each data type
        // This is a significant challenge and would require a more complex implementation
        
        // Example for binding string array (simplified)
        if (array_values_->empty()) {
            // Empty array
            SQLRETURN ret = SQLBindParameter(
                hstmt,
                index_,
                param_type_,
                c_type_,
                sql_type_,
                param_size_,
                decimal_digits_,
                nullptr,
                0,
                indicators_->data()
            );
            
            if (ret != SQL_SUCCESS && ret != SQL_SUCCESS_WITH_INFO) {
                std::cerr << "Error binding empty array parameter " << index_ << std::endl;
            }
            
            return;
        }
        
        // Note: Real implementation would need to properly handle the array data
        // This would require allocating contiguous memory and copying values
        // For now, this is just a placeholder showing how array binding works
        
        std::cerr << "Array binding not fully implemented yet" << std::endl;
    }  
}