#include <platform.h>
#include <query_parameter.h>
#include <parameter_set.h>

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

    std::shared_ptr<ParameterSet> ParameterSet::createFromJsArray(const Napi::Env& env, const Napi::Array& array)
    {
        auto paramSet = std::make_shared<ParameterSet>();
        
        for (uint32_t i = 0; i < array.Length(); i++) {
            Napi::Value elem = array.Get(i);
            auto param = QueryParameter::createFromJs(env, elem, i + 1); // ODBC params are 1-based
            paramSet->add(param);
        }
        
        return paramSet;
    }
}
