// In parameter_factory.cpp
#include <napi.h>
#include "common/platform.h"
#include "odbc/parameter_set.h"
#include "odbc/parameter_factory.h"
#include "js/js_object_mapper.h"
#include <iostream>

namespace mssql
{
  std::shared_ptr<ParameterSet> ParameterFactory::createParameterSet(const Napi::CallbackInfo &info)
  {
    return std::make_shared<ParameterSet>();
  }

  std::shared_ptr<QueryParameter> ParameterFactory::createParameter(const Napi::Env &env, const Napi::Value &value, int paramIndex)
  {
    // Simply delegate to the appropriate QueryParameter factory method
    return std::make_shared<QueryParameter>(paramIndex, std::make_shared<DatumStorage>());
  }
}