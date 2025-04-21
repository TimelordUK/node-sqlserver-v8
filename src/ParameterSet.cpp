#include <QueryParameter.h>
#include <ParameterSet.h>

namespace mssql
{
    ParameterSet::ParameterSet() {
    }

    void ParameterSet::add(std::shared_ptr<QueryParameter> qp)
    {
        parameters_.emplace_back(qp);
    }
}
