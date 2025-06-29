// napi_wrapper.h
#pragma once
#include <node_api.h>

namespace mssql {
class NapiWrapper {
 public:
  // Default implementation calls the real function
  static napi_status GetDateValue(napi_env env, napi_value value, double* result) {
    return napi_get_date_value(env, value, result);
  }

  // For testing, you can override this function pointer
  static napi_status (*GetDateValueImpl)(napi_env env, napi_value value, double* result);
};

// Initialize with the default implementation
inline napi_status (*NapiWrapper::GetDateValueImpl)(napi_env env,
                                                    napi_value value,
                                                    double* result) = NapiWrapper::GetDateValue;
}  // namespace mssql
