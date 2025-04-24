
#pragma once
// undo these tokens to use numeric_limits below

#undef min
#undef max
#include <platform.h>
#include <limits>
#include <vector>
#include <string.h>
#include <memory>
#include <napi.h>

#ifdef LINUX_BUILD
#include <cmath>
#include <cfloat>
#endif

namespace mssql {
    enum JSParamType {        
    };
    enum JSDataType {        
    };
    class DataStorage;
    class JSParam {
    public:
        static std::shared_ptr<JSParam> createFromJs(const Napi::Env& env, const Napi::Value& value, int paramIndex);
  
    };
}
