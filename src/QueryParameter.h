 // Helper class to store query parameters
 #pragma once
#include <napi.h>
#include <platform.h>
#include <mutex>
#include <string>
#include <memory>

namespace mssql
{
 class QueryParameter {
    public:
        // Different constructor overloads for different parameter types
        explicit QueryParameter(const std::string& value) : stringValue_(value), type_(Type::String) {}
        explicit QueryParameter(double value) : numberValue_(value), type_(Type::Number) {}
        explicit QueryParameter(bool value) : boolValue_(value), type_(Type::Boolean) {}
        explicit QueryParameter() : type_(Type::Null) {} // For NULL values
    
        enum class Type {
            String,
            Number,
            Boolean,
            Null
        };
    
        Type getType() const { return type_; }
        const std::string& getStringValue() const { return stringValue_; }
        double getNumberValue() const { return numberValue_; }
        bool getBoolValue() const { return boolValue_; }
    
    private:
        std::string stringValue_;
        double numberValue_ = 0.0;
        bool boolValue_ = false;
        Type type_;
    };
}