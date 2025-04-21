#include <platform.h>
#include <DatumStorage.h>
#include <QueryParameter.h>
#include <ParameterSet.h>
#include <ParameterFactory.h>

namespace mssql
{
    bool ParameterFactory::populateParameterSet(const Napi::Array &params, std::shared_ptr<ParameterSet> set)
    {
        // Convert JavaScript parameters to C++ parameters
        const uint32_t length = params.Length();
        for (uint32_t i = 0; i < length; i++)
        {
            Napi::Value value = params[i];
            if (value.IsString())
            {
                set->add(std::make_shared<QueryParameter>(
                    value.As<Napi::String>().Utf8Value()));
            }
            else if (value.IsNumber())
            {
                set->add(std::make_shared<QueryParameter>(
                    value.As<Napi::Number>().DoubleValue()));
            }
            else if (value.IsBoolean())
            {
                set->add(std::make_shared<QueryParameter>(
                    value.As<Napi::Boolean>().Value()));
            }
            else if (value.IsNull() || value.IsUndefined())
            {
                set->add(std::make_shared<QueryParameter>());
            }

            return true;
        }
    }
}