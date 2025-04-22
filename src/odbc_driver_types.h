// C++ equivalent of ProcedureParamMeta

#pragma once

#include "platform.h"
#include <iostream>
#include <ostream>

// Common ODBC utility functions and constants
namespace mssql
{
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

    std::ostream &operator<<(std::ostream &os, const ProcedureParamMeta &param)
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
}