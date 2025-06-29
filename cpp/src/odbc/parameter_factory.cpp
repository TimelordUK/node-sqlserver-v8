// In parameter_factory.cpp
#include <platform.h>
#include <common/odbc_common.h>
#include <odbc/parameter_factory.h>

#include <napi.h>

#include <iostream>

#include <js/js_object_mapper.h>
#include <odbc/parameter_set.h>

namespace mssql {
std::shared_ptr<ParameterSet> ParameterFactory::createParameterSet(const Napi::CallbackInfo& info) {
  return std::make_shared<ParameterSet>();
}

std::shared_ptr<QueryParameter> ParameterFactory::createParameter(const Napi::Env& env,
                                                                  const Napi::Value& value,
                                                                  int paramIndex) {
  // Simply delegate to the appropriate QueryParameter factory method
  return std::make_shared<QueryParameter>(paramIndex, std::make_shared<DatumStorage>());
}
}  // namespace mssql