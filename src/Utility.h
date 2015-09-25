//---------------------------------------------------------------------------------------------------------------------------------
// File: Utility.h
// Contents: Utility functions used in Microsoft Driver for Node.js for SQL Server
// 
// Copyright Microsoft Corporation and contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
//
// You may obtain a copy of the License at:
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//---------------------------------------------------------------------------------------------------------------------------------

#pragma once
#include <v8.h>
#include <sstream>
#include <map>
#include <mutex>


namespace mssql
{
    using namespace std;
    using namespace v8;

    inline Local<String> New(const wchar_t* text)
    {
	   return String::NewFromTwoByte(Isolate::GetCurrent(), reinterpret_cast<const uint16_t*>(text));
    }

    wstring FromV8String(Handle<String> input);

    string w2a(const wchar_t* input);

    class bufferPoolChar_t
    {
    public:
	   typedef vector<char> vec_t;
	   typedef shared_ptr<vec_t> shared_vec_ptr_t;
	   typedef map<int, shared_vec_ptr_t> elements_t;
	   static mutex g_i_mutex;

	   struct def
	   {
		  def() : id(-1) {}
		  def(int id, shared_vec_ptr_t p) : p(p), id(id) {}
		  shared_vec_ptr_t p;
		  int id;
	   };

	   static def accept(const vec_t & src)
	   {
		  lock_guard<mutex> lock(g_i_mutex);
		  vec_t b = move(src);
		  auto sp = make_shared<vec_t>(b);
		  int id = ++_id;
		  elements_map.insert(pair<int, shared_vec_ptr_t>(id, sp));
		  return def(id, sp);
	   }

	   static void remove(int id)
	   {
		  lock_guard<mutex> lock(g_i_mutex);
		  elements_map.erase(id);
	   }

    private:
	   static elements_t elements_map;
	   static int _id;
    };

    struct nodeTypeFactory
    {
	   static const int64_t NANOSECONDS_PER_MS = 1000000;

	   Isolate *isolate;

	   nodeTypeFactory()
	   {
		  isolate = Isolate::GetCurrent();
	   }

	   Local<Number> newNumber(double d)
	   {
		  return Number::New(isolate, d);
	   }

	   void scopedCallback(const Persistent<Function> & callback, int argc, Local<Value> args[])
	   {
		   auto cons = newCallbackFunction(callback);
		   auto context = isolate->GetCurrentContext();
		   auto global = context->Global();
		   cons->Call(global, argc, args);
	   }

	   Local<Integer> newInteger(int32_t i)
	   {
		  return Integer::New(isolate, i);
	   }

	   Local<Boolean> newBoolean(bool b)
	   {
		  return Boolean::New(isolate, b);
	   }

	   Local<Boolean> newBoolean(uint16_t n)
	   {
		  return Boolean::New(isolate, n != 0 ? true : false);
	   }

	   Local<Integer> newInt32(int32_t i)
	   {
		  return Int32::New(isolate, i);
	   }

	   Local<Number> newInt64(int64_t i)
	   {
		  return Number::New(isolate, i);
	   }

	   Local<Object> newObject()
	   {
		  return Object::New(isolate);
	   }

	   Local<Value> newNumber()
	   {
		  return Object::New(isolate);
	   }

	   Local<Integer> newUint32(uint32_t n)
	   {
		  return Integer::New(isolate, n);
	   }

	   Local<String> newString(const char *cstr)
	   {
		  return String::NewFromUtf8(isolate, cstr);
	   }

	   Local<String> newString(const char *cstr, int size)
	   {
		  return String::NewFromUtf8(isolate, cstr, String::NewStringType::kNormalString, size);
	   }

	   Local<Array> newArray()
	   {
		  return Array::New(isolate);
	   }

	   Local<Array> newArray(int count)
	   {
		  return Array::New(isolate, count);
	   }

	   Local<Value> newLocalValue(const Handle<Value> & v)
	   {
		  return Local<Value>::New(isolate, v);
	   }

	   Local<Function> newCallbackFunction(const Persistent<Function> & callback)
	   {
		  return Local<Function>::New(isolate, callback);
	   }

	   Local<FunctionTemplate> newTemplate(const FunctionCallback & callback)
	   {
		  return FunctionTemplate::New(isolate, callback);
	   }

	   Local<Object> newObject(const Persistent <Object> & bp)
	   {
		  return Local<Object>::New(isolate, bp);
	   }

	   Local<Value> fromTwoByte(const wchar_t* text)
	   {
		  return String::NewFromTwoByte(isolate, reinterpret_cast<const uint16_t*>(text));
	   }

	   Local<Value> fromTwoByte(const uint16_t* text)
	   {
		  return String::NewFromTwoByte(isolate, text);
	   }

	   Local<Value> fromTwoByte(const uint16_t* text, int size)
	   {
		  return String::NewFromTwoByte(isolate, text, String::NewStringType::kNormalString, size);
	   }

	   Local<Value> newBuffer(int size)
	   {
		   return node::Buffer::New(isolate, size)
#ifdef NODE_GYP_V4 
			   .ToLocalChecked()
#endif
			   ;
	   }

	   Local<Object> error(const stringstream &full_error)
	   {
		  auto err = Local<Object>::Cast(Exception::Error(newString(full_error.str().c_str())));
		  return err;
	   }

	   Local<Object> error(const char* full_error)
	   {
		  auto err = Local<Object>::Cast(Exception::Error(newString(full_error)));
		  return err;
	   }

	   Local<Value> newDate()
	   {
		  auto dd = Date::New(isolate, 0.0);
		  return dd;
	   }

	   Local<Value> newDate(double milliseconds, int32_t nanoseconds_delta)
	   {
		  auto ns = String::NewFromUtf8(isolate, "nanosecondsDelta");
		  auto n = Number::New(isolate, nanoseconds_delta / (NANOSECONDS_PER_MS * 1000.0));
		  // include the properties for items in a DATETIMEOFFSET that are not included in a JS Date object
		  auto dd = Date::New(isolate, milliseconds);
		  dd->ToObject()->Set(ns, n);
		  return dd;
	   }

	   Local<Value> global()
	   {
		  return isolate->GetCurrentContext()->Global();
	   }

	   Handle<Primitive> null()
	   {
		  return Null(isolate);
	   }

	   Handle<Primitive> undefined()
	   {
		  return Undefined(isolate);
	   }

	   void throwError(const char * err)
	   {
		  isolate->ThrowException(error(err));
	   }
    };
}
