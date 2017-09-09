#include "stdafx.h"
#include <BoundDatum.h>
#include <BoundDatumSet.h>
#include <ResultSet.h>

namespace mssql
{
	BoundDatumSet::BoundDatumSet() : 
		err(nullptr), 
		first_error(0), 
		_output_param_count(-1)
	{
		_bindings = make_shared<param_bindings>();
	}

	bool BoundDatumSet::reserve(shared_ptr<ResultSet> set) const
	{
		for (uint32_t i = 0; i < set->GetColumns(); ++i) {
			BoundDatum binding;
			auto & def = set->GetMetadata(i);
			binding.reserve_column_type(def.dataType, def.columnSize);
			_bindings->push_back(move(binding));
		}
		return true;
	}

	bool BoundDatumSet::bind(Handle<Array> &node_params)
	{
		const auto count = node_params->Length();
		auto res = true;
		_output_param_count = 0;
		if (count > 0) {
			for (uint32_t i = 0; i < count; ++i) {
				BoundDatum binding;
				auto v = node_params->Get(i);
				res = binding.bind(v);

				switch (binding.param_type)
				{
				case SQL_PARAM_OUTPUT:
				case SQL_PARAM_INPUT_OUTPUT:
					_output_param_count++;
					break;

				default:
					break;
				}
				if (!res) {
					err = binding.getErr();
					first_error = i;
					break;
				}
				_bindings->push_back(move(binding));
			}
		}

		return res;
	}

	Local<Array> BoundDatumSet::unbind()
	{
		nodeTypeFactory fact;
		const auto arr = fact.newArray(_output_param_count);
		auto i = 0;

		std::for_each(_bindings->begin(), _bindings->end(), [&](BoundDatum& param) mutable
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
