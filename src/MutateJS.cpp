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
		nodeTypeFactory fact;
		const auto context = fact.isolate->GetCurrentContext();
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
		nodeTypeFactory fact;
		const auto context = fact.isolate->GetCurrentContext();
		const auto l = get(query_object, v);
		if (!isUnDefined(l))
		{
			return Nan::To<int64_t>(l).ToChecked();
		}
		return 0;
	}

	int64_t MutateJS::getint64(const Local<Number> l)
	{
		nodeTypeFactory fact;
		const auto context = fact.isolate->GetCurrentContext();
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
	
#ifdef PRE_V13
		
	Local<Value> MutateJS::from_two_byte(const wchar_t* text)
	{
		const nodeTypeFactory fact;
		return String::NewFromTwoByte(fact.isolate, reinterpret_cast<const uint16_t*>(text));
	}

	Local<Value> MutateJS::from_two_byte(const uint16_t* text)
	{
		const nodeTypeFactory fact;
		return String::NewFromTwoByte(fact.isolate, text);
	}

	Local<Value> MutateJS::from_two_byte(const uint16_t* text, const size_t size)
	{
		const nodeTypeFactory fact;
		return String::NewFromTwoByte(fact.isolate, text, String::NewStringType::kNormalString, static_cast<int>(size));
	}

#else
 		
	 Local<Value> MutateJS::from_two_byte(const uint16_t* text, const size_t size)
	 {
		 nodeTypeFactory fact;
		 auto context = fact.isolate->GetCurrentContext();
		 const auto maybe = String::NewFromTwoByte(context->GetIsolate(), text, NewStringType::kNormal, static_cast<int>(size));
		 const Local<Value> d;
		 return maybe.FromMaybe(d);
	 }

	 Local<Value> MutateJS::from_two_byte(const wchar_t* text)
	 {
		 nodeTypeFactory fact;
		 auto context = fact.isolate->GetCurrentContext();
		 const auto maybe = String::NewFromTwoByte(context->GetIsolate(), reinterpret_cast<const uint16_t*>(text), NewStringType::kNormal);
		 const Local<Value> d;
		 return maybe.FromMaybe(d);
	 }

	 Local<Value> MutateJS::from_two_byte(const uint16_t* text)
	 {
		 nodeTypeFactory fact;
		 auto context = fact.isolate->GetCurrentContext();
		 const auto maybe = String::NewFromTwoByte(context->GetIsolate(), text, NewStringType::kNormal);
		 const Local<Value> d;
		 return maybe.FromMaybe(d);
	 }
	
#endif

}
