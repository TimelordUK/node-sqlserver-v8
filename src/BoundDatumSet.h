#pragma once
#include "BoundDatum.h"
#include <list>

namespace mssql
{
	class BoundDatumSet
	{
	public:	
		bool bind(Handle<Array> &node_params);
		Local<Array> unbind();
		
		void clear() { bindings.clear(); }
		list<BoundDatum>::iterator begin() { return bindings.begin(); }
		list<BoundDatum>::iterator end() { return bindings.end(); }

		char * err;
		int first_error;


	private:
		typedef list<BoundDatum> param_bindings; // list because we only insert and traverse in-order
		int output_param_count;
		param_bindings bindings;	
	};
}
