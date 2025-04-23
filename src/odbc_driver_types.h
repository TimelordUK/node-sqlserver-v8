// C++ equivalent of ProcedureParamMeta and NativeParam

#pragma once

#include "platform.h"
#include <iostream>
#include <ostream>
#include <variant>
#include <vector>

// Common ODBC utility functions and constants
namespace mssql
{
    // Existing structure
    struct ProcedureParamMeta
    {
        std::string proc_name;
        std::string type_desc;
        int64_t object_id;
        bool has_default_value;
        std::string default_value;
        bool is_output;
        std::string name;
        std::string type_id;
        int max_length;
        int order;
        std::string collation;
        bool is_user_defined;
    };

    // sqlQueryParamType equivalent
    using SqlParamValue = std::variant<
        std::nullptr_t,
        bool,
        int32_t,
        int64_t,
        double,
        std::string,
        std::vector<uint8_t>  // for binary data
    >;

    // New structure for NativeParam
    struct NativeParam
    {
        bool is_user_defined = false;
        int32_t type_id = 0;
        std::string schema;
        bool bcp = false;
        int32_t bcp_version = 0;
        std::string table_name;
        int32_t ordinal_position = 0;
        int32_t scale = 0;
        int32_t offset = 0;
        int32_t precision = 0;
        bool is_output = false;
        std::string name;
        SqlParamValue value;
    };

    inline std::ostream &operator<<(std::ostream &os, const ProcedureParamMeta &param)
    {
        os << "ProcedureParamMeta {\n"
           << "  proc_name: " << param.proc_name << ",\n"
           << "  type_desc: " << param.type_desc << ",\n"
           << "  object_id: " << param.object_id << ",\n"
           << "  has_default_value: " << (param.has_default_value ? "true" : "false") << ",\n"
           << "  default_value: " << param.default_value << ",\n"
           << "  is_output: " << (param.is_output ? "true" : "false") << ",\n"
           << "  name: " << param.name << ",\n"
           << "  type_id: " << param.type_id << ",\n"
           << "  max_length: " << param.max_length << ",\n"
           << "  order: " << param.order << ",\n"
           << "  collation: " << param.collation << ",\n"
           << "  is_user_defined: " << (param.is_user_defined ? "true" : "false") << "\n"
           << "}";
        return os;
    }

    inline std::ostream &operator<<(std::ostream &os, const NativeParam &param)
    {
        os << "NativeParam {\n"
           << "  is_user_defined: " << (param.is_user_defined ? "true" : "false") << ",\n"
           << "  type_id: " << param.type_id << ",\n"
           << "  schema: " << param.schema << ",\n"
           << "  bcp: " << (param.bcp ? "true" : "false") << ",\n"
           << "  bcp_version: " << param.bcp_version << ",\n"
           << "  table_name: " << param.table_name << ",\n"
           << "  ordinal_position: " << param.ordinal_position << ",\n"
           << "  scale: " << param.scale << ",\n"
           << "  offset: " << param.offset << ",\n"
           << "  precision: " << param.precision << ",\n"
           << "  is_output: " << (param.is_output ? "true" : "false") << ",\n"
           << "  name: " << param.name << "\n"
           << "  // value field omitted as it's a variant type\n"
           << "}";
        return os;
    }
}