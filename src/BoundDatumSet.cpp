#include "stdafx.h"
#include "BoundDatumSet.h"

namespace mssql
{
	bool BoundDatumSet::bind(Handle<Array> &node_params)
	{
		uint32_t count = node_params->Length();
		bool res = true;
		output_param_count = 0;
		if (count > 0) {
			for (uint32_t i = 0; i < count; ++i) {
				BoundDatum binding;
				auto v = node_params->Get(i);
				res = binding.bind(v);

				switch (binding.param_type)
				{
				case SQL_PARAM_OUTPUT:
				case SQL_PARAM_INPUT_OUTPUT:
					output_param_count++;
					break;

				default:
					break;
				}
				if (!res) {
					err = binding.getErr();
					first_error = i;
					break;
				}
				bindings.push_back(move(binding));
			}
		}

		return res;
	}

	Local<Array> BoundDatumSet::unbind()
	{
		nodeTypeFactory fact;
		auto arr = fact.newArray(output_param_count);
		int i = 0;

		std::for_each(bindings.begin(), bindings.end(), [&](BoundDatum& param) mutable
		{
			switch (param.param_type)
			{
			case SQL_PARAM_OUTPUT:
			case SQL_PARAM_INPUT_OUTPUT:
			{
				auto v = param.unbind();
				arr->Set(i++, v);
			}
			break;

			default:
				break;
			}
		});
		return arr;
	}
}