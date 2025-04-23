// In query_parameter.h
#pragma once

#include <memory>
#include <vector>
#include <variant>
#include <string>
#include <sql.h>
#include <sqlext.h>
#include <napi.h>
#include "odbc_driver_types.h"

namespace mssql
{
    // Forward declarations
    class ParameterSet;

    /**
     * @brief Represents a parameter value that can be bound to an ODBC statement
     */
    class QueryParameter {
    public:
        // Parameter binding types
        enum class BindType {
            SINGLE,       // Single scalar value
            ARRAY,        // Array of values (bulk binding)
            OBJECT,       // Object with metadata
            TVP           // Table-valued parameter (for future implementation)
        };

        /**
         * @brief Create a parameter from a native JavaScript value
         * @param env NAPI environment
         * @param value JavaScript value
         * @param paramIndex Parameter index (1-based as per ODBC)
         * @return Shared pointer to QueryParameter instance
         */
        static std::shared_ptr<QueryParameter> createFromJs(const Napi::Env& env, const Napi::Value& value, int paramIndex);

        /**
         * @brief Create a parameter from a NativeParam object
         * @param param NativeParam with metadata and value
         * @param paramIndex Parameter index (1-based as per ODBC)
         * @return Shared pointer to QueryParameter instance
         */
        static std::shared_ptr<QueryParameter> createFromNativeParam(const NativeParam& param, int paramIndex);

        /**
         * @brief Create a parameter from an array of values
         * @param env NAPI environment
         * @param array JavaScript array
         * @param paramIndex Parameter index (1-based as per ODBC)
         * @return Shared pointer to QueryParameter instance
         */
        static std::shared_ptr<QueryParameter> createFromArray(const Napi::Env& env, const Napi::Array& array, int paramIndex);

        /**
         * @brief Bind this parameter to an ODBC statement
         * @param hstmt ODBC statement handle
         * @return SQL_SUCCESS if binding was successful, error code otherwise
         */
        SQLRETURN bind(SQLHSTMT hstmt);

        /**
         * @brief Get the parameter index
         * @return Parameter index (1-based as per ODBC)
         */
        int getIndex() const { return index_; }

        /**
         * @brief Get the SQL type of this parameter
         * @return SQL type code
         */
        SQLSMALLINT getSqlType() const { return sql_type_; }

        /**
         * @brief Get the C type of this parameter
         * @return C type code
         */
        SQLSMALLINT getCType() const { return c_type_; }

        /**
         * @brief Get the parameter direction
         * @return SQL_PARAM_INPUT, SQL_PARAM_OUTPUT, or SQL_PARAM_INPUT_OUTPUT
         */
        SQLSMALLINT getParamType() const { return param_type_; }

        /**
         * @brief Get the parameter size
         * @return Parameter size in bytes
         */
        SQLULEN getParamSize() const { return param_size_; }

        /**
         * @brief Check if this parameter is an output parameter
         * @return true if this is an output parameter
         */
        bool isOutput() const { return param_type_ == SQL_PARAM_OUTPUT || param_type_ == SQL_PARAM_INPUT_OUTPUT; }

        /**
         * @brief Get the name of this parameter
         * @return Parameter name
         */
        const std::string& getName() const { return name_; }

        /**
         * @brief Get the binding type of this parameter
         * @return BindType value
         */
        BindType getBindType() const { return bind_type_; }

        /**
         * @brief Get the number of elements in this parameter
         * @return 1 for scalar parameters, array size for array parameters
         */
        SQLULEN getElementCount() const { return element_count_; }
        QueryParameter(int index);
    private:
        // Private constructor - use factory methods
      
        // Helper methods for mapping types
        static SQLSMALLINT mapJsToSqlType(const Napi::Value& value);
        static SQLSMALLINT mapJsToSqlCType(const Napi::Value& value);
        void inferTypeInfo(const Napi::Value& value);
        void bindSingleValue(SQLHSTMT hstmt);
        void bindArrayValue(SQLHSTMT hstmt);

        // Member variables
        int index_;                      // Parameter index (1-based)
        std::string name_;               // Parameter name
        SQLSMALLINT sql_type_;           // SQL data type
        SQLSMALLINT c_type_;             // C data type
        SQLSMALLINT param_type_;         // Parameter type (input/output)
        SQLULEN param_size_;             // Column size
        SQLSMALLINT decimal_digits_;     // Decimal digits
        SQLLEN indicator_;               // Indicator variable
        SQLULEN element_count_;          // Number of elements (for array binding)
        BindType bind_type_;             // Binding type
        
        // Storage for the value
        union {
            SqlParamValue* single_value_;           // For single values
            std::vector<SqlParamValue>* array_values_;  // For array values
        };
        
        // Storage for indicator values (for array binding)
        std::vector<SQLLEN>* indicators_;
        
        // Metadata storage
        NativeParam metadata_;
        
        // Flag indicating if this parameter owns the storage
        bool owns_storage_;
    };

   
}