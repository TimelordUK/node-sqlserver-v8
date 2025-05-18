#include <napi.h>
#include <parameter_set.h>
#include <platform.h>
#include "odbc_driver_types.h"

namespace mssql {
// ParameterSet implementation

ParameterSet::ParameterSet() {}

void ParameterSet::add(std::shared_ptr<SqlParameter> qp) {
  parameters_.push_back(qp);
}

}  // namespace mssql
