#include "stdafx.h"
#include <MutateJS.h>
#include <nan.h>

namespace mssql
{
	bool MutateJS::getbool(const Local<Object> query_object, const char* v)
	{
		const auto l = get(query_object, v);
		return as_boolean(l);
	}

	 Local<Value> MutateJS::get_array_elelemt_at_index(const Local<Array> &arr, const unsigned int index)
	 {
		const auto t = Nan::Get(arr, index).ToLocalChecked();
		return t;
	 }

	 bool MutateJS::set_array_elelemt_at_index(const Local<Array>& arr, const unsigned int index, const Local<Value>& value)
	 {
		 return Nan::Set(arr, index, value).ToChecked();
	 }

	 bool MutateJS::set_property_value(const Local<Object>& o, const Local<Value>& p, const Local<Value>& v)
	 {
		 return Nan::Set(o, p, v).ToChecked();
	 }

	Local<Value> MutateJS::get_property_as_value(const Local<Object>& o, const Local<Value>& v)
	{
		const nodeTypeFactory fact;
		if ( o->IsUndefined() || o->IsNull()) {
			return fact.null();
		}
		const auto p = Nan::Get(o,v).ToLocalChecked();
		return p;
	}

	static bool isUnDefined(const Local<Value> l) {
		return l->IsUndefined() || l->IsNull();
	}

	int32_t MutateJS::getint32(const Local<Object> query_object, const char* v)
	{
		const auto l = get(query_object, v);
		if (!isUnDefined(l))
		{
			return Nan::To<int32_t>(l).ToChecked();
		}
		return 0;
	}

	 bool MutateJS::as_boolean(const Local<Value>& as_val) 
	 {
		 if (!isUnDefined(as_val))
		 {
			 return Nan::To<bool>(as_val).ToChecked();
		 }
		 return false;
	 }

	int32_t MutateJS::getint32(const Local<Number> l)
	{
		const auto v = isUnDefined(l) ? 0 : Nan::To<int32_t>(l).ToChecked();
		return v;
	}

	int64_t MutateJS::getint64(const Local<Object> query_object, const char* v)
	{
		const auto l = get(query_object, v);
		if (!isUnDefined(l))
		{
			return Nan::To<int64_t>(l).ToChecked();
		}
		return 0;
	}

	int64_t MutateJS::getint64(const Local<Number> l)
	{
		if (!isUnDefined(l))
		{
			return Nan::To<int64_t>(l).ToChecked();
		}
		return 0;
	}

	Local<Value> MutateJS::get_property_as_value(const Local<Object>& o, const char* v)
	{
		return get(o, v);
	}

	Local<Value> MutateJS::get(const Local<Object> o, const char* v)
	{
		const nodeTypeFactory fact;
		if (isUnDefined(o)) {
			return fact.null();
		}
		const auto p = Nan::Get(o, Nan::New<String>(v).ToLocalChecked()).ToLocalChecked();
		return p;
	}
	
	 Local<Value> MutateJS::from_two_byte(const uint16_t* text, const size_t size)
	 {
		 auto s = Nan::New<String>(text, size).ToLocalChecked();
		 return s;
	 }

	 Local<Value> MutateJS::from_two_byte(const uint16_t* text)
	 {
 		auto s = Nan::New<String>(text).ToLocalChecked();
		return s;
	 }
}
