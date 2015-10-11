#pragma once
#include "BoundDatum.h"
#include <vector>

namespace mssql
{
	class BoundDatumSet
	{
	public:	
		bool bind(Handle<Array> &node_params);
		Local<Array> unbind();
		
		void clear() { bindings.clear(); }
		int size() { return bindings.size(); }
		vector<BoundDatum>::iterator begin() { return bindings.begin(); }
		vector<BoundDatum>::iterator end() { return bindings.end(); }

		char * err;
		int first_error;

	private:
		typedef vector<BoundDatum> param_bindings; 
		int output_param_count;
		param_bindings bindings;	
	};
}
