#include "stdafx.h"
#include <BoundDatum.h>
#include <BoundDatumSet.h>
#include <QueryOperationParams.h>
#include <ResultSet.h>

namespace mssql
{
	BoundDatumSet::BoundDatumSet() :
		err(nullptr),
		first_error(0),
		_output_param_count(-1),
		_params(nullptr)
	{
		_bindings = make_shared<param_bindings>();
	}

	BoundDatumSet::BoundDatumSet(shared_ptr<QueryOperationParams> params) : 
	BoundDatumSet()
	{
		_params = params;
	}

	bool BoundDatumSet::reserve(const shared_ptr<ResultSet>& set, const size_t row_count) const
	{
		for (uint32_t i = 0; i < set->get_column_count(); ++i) {
			const auto binding = make_shared<BoundDatum>(_params);
			auto& def = set->get_meta_data(i);
			size_t size = def.columnSize;
			size_t newSize = size;
			binding->reserve_column_type(def.dataType, newSize, row_count);
			if (size != newSize) {
				def.columnSize = newSize;
			}
			_bindings->push_back(binding);
		}
		return true;
	}

	Local<Value> get(const Local<Object> o, const char* v)
	{	
		const auto vp = Nan::New(v).ToLocalChecked();
		const auto val = Nan::Get(o, vp).ToLocalChecked();
		return val;
	}

	int get_tvp_col_count(Local<Value>& v)
	{
		const auto tvp_columns = Nan::Get(Nan::To<Object>(v).ToLocalChecked(), Nan::New("table_value_param").ToLocalChecked()).ToLocalChecked();
		const auto cols = tvp_columns.As<Array>();
		const auto count = cols->Length();
		return count;
	}

	bool BoundDatumSet::tvp(Local<Value>& v) const
	{
		const auto tvp_columns = Nan::Get(Nan::To<Object>(v).ToLocalChecked(), Nan::New("table_value_param").ToLocalChecked()).ToLocalChecked();
		if (tvp_columns->IsNull()) return false;
		if (!tvp_columns->IsArray()) return false;

		const auto cols = tvp_columns.As<Array>();
		const auto count = cols->Length();

		for (uint32_t i = 0; i < count; ++i) {
			const auto binding = make_shared<BoundDatum>();
			auto p = Nan::Get(Nan::To<Object>(tvp_columns).ToLocalChecked(), i).ToLocalChecked();
			const auto res = binding->bind(p);
			if (!res) break;
			_bindings->push_back(binding);
		}
		return true;
	}

	bool BoundDatumSet::bind(Local<Array>& node_params)
	{
		const auto count = node_params->Length();
		auto res = true;
		_output_param_count = 0;
		if (count > 0) {
			for (uint32_t i = 0; i < count; ++i) {
				const auto binding = make_shared<BoundDatum>();
				auto v = Nan::Get(node_params, i).ToLocalChecked();
				res = binding->bind(v);

				switch (binding->param_type)
				{
				case SQL_PARAM_OUTPUT:
				case SQL_PARAM_INPUT_OUTPUT:
					_output_param_count++;
					break;

				default:
					break;
				}

				if (!res) {
					err = binding->getErr();
					first_error = i;
					break;
				}

				_bindings->push_back(binding);

				if (binding->is_tvp)
				{
					const auto col_count = get_tvp_col_count(v);
					binding->tvp_no_cols = col_count;
					res = tvp(v);
				}
			}
		}

		return res;
	}

	Local<Array> BoundDatumSet::unbind() const
	{
		const nodeTypeFactory fact;
		const auto arr = fact.new_array(_output_param_count);
		auto i = 0;

		std::for_each(_bindings->begin(), _bindings->end(), [&](const shared_ptr<BoundDatum> & param) mutable
			{
				switch (param->param_type)
				{
				case SQL_PARAM_OUTPUT:
				case SQL_PARAM_INPUT_OUTPUT:
				{
					const auto v = param->unbind();
					Nan::Set(arr, i++, v);
				}
				break;

				default:
					break;
				}
			});
		return arr;
	}
}
