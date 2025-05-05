#include <platform.h>
#include <query_parameter.h>
#include <parameter_set.h>
#include <napi.h>

namespace mssql
{
  // ParameterSet implementation

  ParameterSet::ParameterSet()
  {
  }

  void ParameterSet::add(std::shared_ptr<QueryParameter> qp)
  {
    parameters_.push_back(qp);
  }

}
