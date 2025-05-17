// In parameter_factory.h
#pragma once

#include <napi.h>

#include <memory>

#include "query_parameter.h"

namespace mssql {
/**
 * @brief Factory class for creating query parameters from JavaScript values
 */
class QueryParameter;
class ParameterSet;

class ParameterFactory {
 public:
  /**
   * @brief Create a parameter set from a JavaScript array of parameters
   * @param env NAPI environment
   * @param args Arguments to convert
   * @return Shared pointer to ParameterSet
   */
  static std::shared_ptr<ParameterSet> createParameterSet(const Napi::CallbackInfo& info);

  /**
   * @brief Create a parameter from a JavaScript value
   * @param env NAPI environment
   * @param value JavaScript value
   * @param paramIndex Parameter index (1-based)
   * @return Shared pointer to QueryParameter
   */
  static std::shared_ptr<QueryParameter> createParameter(const Napi::Env& env,
                                                         const Napi::Value& value,
                                                         int paramIndex);
};
}  // namespace mssql