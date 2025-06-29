
#pragma once
// undo these tokens to use numeric_limits below

#undef min
#undef max
#include <napi.h>
#include <platform.h>
#include <string.h>

#include <limits>
#include <memory>
#include <vector>

#ifdef LINUX_BUILD
#include <cfloat>
#include <cmath>
#endif

namespace mssql {
enum JSParamType {};
enum JSDataType {};
class DataStorage;
class JSParam {
 public:
  static std::shared_ptr<JSParam> createFromJs(const Napi::Env& env,
                                               const Napi::Value& value,
                                               int paramIndex);
};
}  // namespace mssql
