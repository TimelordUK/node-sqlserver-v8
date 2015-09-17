//---------------------------------------------------------------------------------------------------------------------------------
// File: OdbcOperation.cpp
// Contents: Functions called by thread queue for background ODBC operations
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

#include "stdafx.h"
#include "NodeColumns.h"
#include "OdbcOperation.h"
#include "OdbcConnection.h"
#include "node_buffer.h"
#include <limits>
#include <sstream>

// undo these tokens to use numeric_limits below
#undef min
#undef max

namespace mssql
{
    // default precision and scale for date/time parameters
    // (This may be updated for older server since they don't have as high a precision)
    const int SQL_SERVER_2008_DEFAULT_DATETIME_PRECISION = 34;
    const int SQL_SERVER_2008_DEFAULT_DATETIME_SCALE = 7;

    void OdbcOperation::InvokeBackground()
    {
	   failed = !TryInvokeOdbc();

	   if (failed) {
		  failure = connection->LastError();
	   }
    }

    int OdbcOperation::Error(Local<Value> args[])
    {
	   nodeTypeFactory fact;
	   auto err = fact.error(failure->Message());
	   err->Set(fact.newString("sqlstate"), fact.newString(failure->SqlState()));
	   err->Set(fact.newString("code"), fact.newInteger(failure->Code()));
	   args[0] = err;
	   int argc = 1;
	   return argc;
    }

    int OdbcOperation::Success(Local<Value> args[])
    {
	   nodeTypeFactory fact;
	   args[0] = fact.newLocalValue(fact.newBoolean(false));
	   auto arg = CreateCompletionArg();
	   args[1] = fact.newLocalValue(arg);
	   int c = output_param->IsNull() ? 0 : output_param.As<Array>()->Length();
	   if (c > 0) args[2] = output_param;
	   int argc = c == 0 ? 2 : 3;
	   return argc;
    }

    void OdbcOperation::CompleteForeground()
    {
	   nodeTypeFactory fact;
	   if (callback.IsEmpty()) return;
	   int argc;
	   Local<Value> args[3];
	   argc = failed ? Error(args) : Success(args);
	   auto cons = fact.newCallbackFunction(callback);
	   cons->Call(fact.global(), argc, args);
    }

    bool OpenOperation::TryInvokeOdbc()
    {
	   return connection->TryOpen(connectionString);
    }

    Local<Value> OpenOperation::CreateCompletionArg()
    {
	   nodeTypeFactory fact;
	   auto o = fact.newObject(backpointer);
	   return o;
    }

    QueryOperation::QueryOperation(shared_ptr<OdbcConnection> connection, const wstring& query, Handle<Object> callback) :
	   OdbcOperation(connection, callback), query(query),
	   output_param_count(0)
    {
    }

    bool QueryOperation::ParameterErrorToUserCallback(uint32_t param, const char* error)
    {
	   nodeTypeFactory fact;

	   params.clear();

	   stringstream full_error;
	   full_error << "IMNOD: [msnodesql] Parameter " << param + 1 << ": " << error;

	   auto err = fact.error(full_error);
	   auto imn = fact.newString("IMNOD");
	   err->Set(fact.newString("sqlstate"), imn);
	   err->Set(fact.newString("code"), fact.newInteger(-1));

	   Local<Value> args[1];
	   args[0] = err;
	   int argc = 1;

	   auto cons = fact.newCallbackFunction(callback);
	   cons->Call(fact.global(), argc, args);

	   return false;
    }

    void QueryOperation::bindNull(ParamBinding & binding, const Local<Value> & p)
    {
	   binding.js_type = ParamBinding::JS_NULL;
	   binding.c_type = SQL_C_CHAR;
	   binding.sql_type = SQL_CHAR;
	   binding.param_size = 1;
	   binding.digits = 0;
	   binding.buffer = nullptr;
	   binding.buffer_len = 0;
	   binding.indptr = SQL_NULL_DATA;
    }

    void QueryOperation::bindString(ParamBinding & binding, const Local<Value> & p)
    {
	   auto str_param = p->ToString();
	   int str_len = str_param->Length();
	   bindString(binding, p, str_len);
    }

    void QueryOperation::bindString(ParamBinding & binding, const Local<Value> & p, int str_len)
    {
	   binding.js_type = ParamBinding::JS_STRING;
	   binding.c_type = SQL_C_WCHAR;
	   binding.sql_type = SQL_WVARCHAR;
	   auto str_param = p->ToString();
	   binding.vec_ptr = make_shared<vector<uint16_t>>(str_len + 1);
	   auto first_p = (*binding.vec_ptr).data();
	   binding.buffer = first_p;   // null terminator
	   str_param->Write(first_p);
	   if (str_len > 4000) {
		  binding.param_size = 0;     // max types require 0 precision
	   }
	   else {
		  binding.param_size = str_len;
	   }
	   binding.buffer_len = str_len * sizeof(uint16_t);
	   binding.digits = 0;
	   binding.indptr = binding.buffer_len;
    }

    void QueryOperation::bindBoolean(ParamBinding & binding, const Local<Value> & p)
    {
	   binding.uint16_ptr = make_shared<uint16_t>(p->BooleanValue());
	   binding.js_type = ParamBinding::JS_BOOLEAN;
	   binding.c_type = SQL_C_BIT;
	   binding.sql_type = SQL_BIT;
	   binding.buffer = binding.uint16_ptr.get();
	   binding.buffer_len = sizeof(uint16_t);
	   binding.param_size = 1;
	   binding.digits = 0;
	   binding.indptr = binding.buffer_len;
    }

    void QueryOperation::bindInt32(ParamBinding & binding, const Local<Value> & p)
    {
	   binding.int32_ptr = make_shared<int32_t>(p->Int32Value());
	   binding.js_type = ParamBinding::JS_INT;
	   binding.c_type = SQL_C_SLONG;
	   binding.sql_type = SQL_INTEGER;
	   binding.buffer = binding.int32_ptr.get();
	   binding.buffer_len = sizeof(int32_t);
	   binding.param_size = sizeof(int32_t);
	   binding.digits = 0;
	   binding.indptr = binding.buffer_len;
    }

    void QueryOperation::bindUint32(ParamBinding & binding, const Local<Value> & p)
    {
	   binding.uint32_ptr = make_shared<uint32_t>(p->Uint32Value());
	   binding.js_type = ParamBinding::JS_UINT;
	   binding.c_type = SQL_C_ULONG;
	   binding.sql_type = SQL_BIGINT;
	   binding.buffer = binding.uint32_ptr.get();
	   binding.buffer_len = sizeof(uint32_t);
	   binding.param_size = sizeof(uint32_t);
	   binding.digits = 0;
	   binding.indptr = binding.buffer_len;
    }

    void QueryOperation::bindDate(ParamBinding & binding, const Local<Value> & p)
    {
	   // Since JS dates have no timezone context, all dates are assumed to be UTC
	   auto dateObject = Handle<Date>::Cast<Value>(p);
	   assert(!dateObject.IsEmpty());
	   // dates in JS are stored internally as ms count from Jan 1, 1970
	   double d = dateObject->NumberValue();
	   binding.time_ptr = make_shared<SQL_SS_TIMESTAMPOFFSET_STRUCT>();
	   TimestampColumn sql_date(d);
	   sql_date.ToTimestampOffset(*binding.time_ptr);

	   binding.js_type = ParamBinding::JS_DATE;
	   binding.c_type = SQL_C_BINARY;
	   // TODO: Determine proper SQL type based on version of server we're talking to
	   binding.sql_type = SQL_SS_TIMESTAMPOFFSET;
	   binding.buffer = binding.time_ptr.get();
	   binding.buffer_len = sizeof(SQL_SS_TIMESTAMPOFFSET_STRUCT);
	   // TODO: Determine proper precision and size based on version of server we're talking to
	   binding.param_size = SQL_SERVER_2008_DEFAULT_DATETIME_PRECISION;
	   binding.digits = SQL_SERVER_2008_DEFAULT_DATETIME_SCALE;
	   binding.indptr = binding.buffer_len;
    }

    void QueryOperation::bindInteger(ParamBinding &binding, const Local<Value> & p)
    {
	   binding.int64_t_ptr = make_shared<int64_t>(p->IntegerValue());
	   binding.js_type = ParamBinding::JS_NUMBER;
	   binding.c_type = SQL_C_SBIGINT;
	   binding.sql_type = SQL_BIGINT;
	   binding.buffer = binding.int64_t_ptr.get();
	   binding.buffer_len = sizeof(int64_t);
	   binding.param_size = sizeof(int64_t);
	   binding.digits = 0;
	   binding.indptr = binding.buffer_len;
    }

    void QueryOperation::bindDouble(ParamBinding &binding, const Local<Value> & p)
    {
	   binding.double_ptr = make_shared<double>(p->NumberValue());
	   binding.js_type = ParamBinding::JS_NUMBER;
	   binding.c_type = SQL_C_DOUBLE;
	   binding.sql_type = SQL_DOUBLE;
	   binding.buffer = binding.double_ptr.get();
	   binding.buffer_len = sizeof(double);
	   binding.param_size = sizeof(double);
	   binding.digits = 0;
	   binding.indptr = binding.buffer_len;
    }

    void QueryOperation::bindNumber(ParamBinding &binding, const Local<Value> & p)
    {
	   // numbers can be either integers or doubles.  We attempt to determine which it is through a simple
	   // cast and equality check
	   double d = p->NumberValue();
	   if (d == floor(d) &&
		  d >= numeric_limits<int64_t>::min() &&
		  d <= numeric_limits<int64_t>::max()) {
		  bindInteger(binding, p);
	   }
	   else {
		  bindDouble(binding, p);
	   }
    }

    void QueryOperation::bindDefault(ParamBinding &binding, Local<Value> & p)
    {
	   // TODO: Determine if we need something to keep the Buffer object from going
	   // away while we use it we could just copy the data, but with buffers being 
	   // potentially very large, that could be problematic
	   auto o = p.As<Object>();

	   binding.js_type = ParamBinding::JS_BUFFER;
	   binding.c_type = SQL_C_BINARY;
	   binding.sql_type = SQL_VARBINARY;
	   binding.buffer = node::Buffer::Data(o);
	   binding.buffer_len = node::Buffer::Length(o);
	   binding.param_size = binding.buffer_len;
	   binding.digits = 0;
	   binding.indptr = binding.buffer_len;
    }

    bool QueryOperation::bindDatumType(Local<Value> & p, int i, ParamBinding & binding)
    {
	   if (p->IsNull()) {
		  bindNull(binding, p);
	   }
	   else if (p->IsString()) {
		  bindString(binding, p);
	   }
	   else if (p->IsBoolean()) {
		  bindBoolean(binding, p);
	   }
	   else if (p->IsInt32()) {
		  bindInt32(binding, p);
	   }
	   else if (p->IsUint32()) {
		  bindUint32(binding, p);
	   }
	   else if (p->IsNumber()) {
		  double d = p->NumberValue();
		  if (_isnan(d) || !_finite(d)) {
			 return ParameterErrorToUserCallback(i, "Invalid number parameter");
		  }
		  bindNumber(binding, p);
	   }
	   else if (p->IsDate()) {
		  bindDate(binding, p);
	   }
	   else if (p->IsObject() && node::Buffer::HasInstance(p)) {
		  bindDefault(binding, p);
	   }
	   else {
		  return ParameterErrorToUserCallback(i, "Invalid parameter type");
	   };

	   return true;
    }

    static Local<Value> get(Local<Object> o, const char *v)
    {
	   nodeTypeFactory fact;
	   auto vp = fact.newString(v);
	   auto val = o->Get(vp);
	   return val;
    }

    static Local<String> getH(Local<Value> o, const char *v)
    {
	   nodeTypeFactory fact;
	   auto vp = fact.newString(v);
	   auto val = o->ToObject()->Get(vp);
	   return val->ToString();
    }

    bool QueryOperation::bind(ParamBinding & binding, int i, Local<Object> o, const char * if_str, uint16_t type)
    {
	   auto val = get(o, if_str);
	   if (!val->IsUndefined())
	   {
		  binding.param_type = type;
		  return bindDatumType(val, i, binding);
	   }
	   return false;
    }

    bool SqlTypeSMapsToNumeric(Local<Value> p)
    {
	   Local<String> str = getH(p, "type_id");
	   auto v = FromV8String(str);
	   bool res = v == L"numeric" || v == L"decimal" || v == L"smallmoney" || v == L"money" || v == L"float" || v == L"real";
	   return res;
    }

    bool SqlTypeSMapsToUInt32(Local<Value> p)
    {
	   Local<String> str = getH(p, "type_id");
	   auto v = FromV8String(str);
	   bool res = v == L"sbigint";
	   return res;
    }

    bool SqlTypeSMapsToInt32(Local<Value> p)
    {
	   Local<String> str = getH(p, "type_id");
	   auto v = FromV8String(str);
	   bool res = v == L"smallint" || v == L"int" || v == L"tinyint";
	   return res;
    }

    bool SqlTypeSMapsTotring(Local<Value> p)
    {
	   Local<String> str = getH(p, "type_id");
	   auto v = FromV8String(str);
	   bool res = v == L"char" || v == L"text" || v == L"varchar";
	   return res;
    }

    bool SqlTypeSMapsToBoolean(Local<Value> p)
    {
	   Local<String> str = getH(p, "type_id");
	   auto v = FromV8String(str);
	   bool res = v == L"bit";
	   return res;
    }

    bool SqlTypeSMapsToDate(Local<Value> p)
    {
	   Local<String> str = getH(p, "type_id");
	   auto v = FromV8String(str);
	   bool res = v == L"date" || v == L"datetimeoffset" || v == L"datetime2" || v == L"smalldatetime" || v == L"datetime" || v == L"time";
	   return res;
    }

    Local<Value> reserveOutputParam(Local<Value> p, int size)
    {
	   Local<Value> pval;
	   nodeTypeFactory fact;

	   if (SqlTypeSMapsToInt32(p))
	   {
		  pval = fact.newInt32(0);
	   }
	   else if (SqlTypeSMapsToUInt32(p))
	   {
		  pval = fact.newUint32(0);
	   }
	   else if (SqlTypeSMapsToBoolean(p))
	   {
		  pval = fact.newInt32(0);
	   }
	   else if (SqlTypeSMapsToNumeric(p))
	   {
		  pval = fact.newNumber(0.0);
	   }
	   else if (SqlTypeSMapsToDate(p))
	   {
		  pval = fact.newDate();
	   }
	   else if (SqlTypeSMapsTotring(p))
	   {
		  vector<char> b;
		  b.resize(size);
		  pval = fact.newString(b.data(), size);
	   }
	   else
	   {
		  pval = fact.newBuffer(size);
	   }
	   return pval;
    }

    bool QueryOperation::bindObject(Handle<Array> & node_params, int i, ParamBinding & binding)
    {
	   auto p = node_params->Get(i);
	   Local<Value> v = get(p->ToObject(), "is_output");
	   if (v->IsUndefined()) return false;
	   auto isOutput = v->ToInt32();
	   Local<Value> pval;
	   int size;
	   size = get(p->ToObject(), "max_length")->Int32Value();
	   if (isOutput->Int32Value() != 0) 
	   {
		  binding.param_type = SQL_PARAM_OUTPUT;
		  pval = reserveOutputParam(p, size);
	   }
	   else
	   {
		  binding.param_type = SQL_PARAM_INPUT;
		  pval = get(p->ToObject(), "val");
	   }

	   bindDatumType(pval, i, binding);

	   return true;
    }

    bool QueryOperation::bindParam(Handle<Array> & node_params, int i, ParamBinding & binding)
    {
	   auto p = node_params->Get(i);
	   bool res = false;
	   if (p->IsObject()) {
		  res =  bindObject(node_params, i, binding);
	   }
	   if (!res) res = bindDatumType(p, i, binding);
	   return res;
    }

    bool QueryOperation::BindParameters(Handle<Array> &node_params)
    {
	   uint32_t count = node_params->Length();
	   bool res = true;
	   output_param_count = 0;
	   if (count > 0) {
		  for (uint32_t i = 0; i < count; ++i) {
			 ParamBinding binding;
			 res = bindParam(node_params, i, binding);
			 switch (binding.param_type)
			 {
			 case SQL_PARAM_OUTPUT:
			 case SQL_PARAM_INPUT_OUTPUT:
				output_param_count++;
				break;

			 default:
				break;
			 }
			 if (!res) break;
			 params.push_back(move(binding));
		  }
	   }

	   return res;
    }

    Handle<Value> QueryOperation::unbindNull(ParamBinding & binding)
    {
	   nodeTypeFactory fact;
	   return fact.null();
    }

    Handle<Value> QueryOperation::unbindString(ParamBinding & binding)
    {
	   nodeTypeFactory fact;
	   auto s = fact.fromTwoByte(binding.vec_ptr->data());
	   return s;
    }

    Handle<Value> QueryOperation::unbindDouble(ParamBinding & binding)
    {
	   nodeTypeFactory fact;
	   auto s = fact.newNumber(*binding.double_ptr);
	   return s;
    }

    Handle<Value> QueryOperation::unbindBoolean(ParamBinding & binding)
    {
	   nodeTypeFactory fact;
	   auto s = fact.newBoolean(*binding.uint16_ptr);
	   return s;
    }

    Handle<Value> QueryOperation::unbindInt32(ParamBinding & binding)
    {
	   nodeTypeFactory fact;
	   auto s = fact.newInt32(*binding.int32_ptr);
	   return s;
    }

    Handle<Value> QueryOperation::unbindUint32(ParamBinding & binding)
    {
	   nodeTypeFactory fact;
	   auto s = fact.newUint32(*binding.uint32_ptr);
	   return s;
    }

    Handle<Value> QueryOperation::unbindNumber(ParamBinding &binding)
    {
	   Handle<Value> v;
	   if (binding.sql_type == SQL_C_DOUBLE) {
		  v = unbindDouble(binding);
	   }
	   else {
		  nodeTypeFactory fact;
		  v = fact.newInt64(*binding.int64_t_ptr);
	   }
	   return v;
    }

    Handle<Value> QueryOperation::unbindDate(ParamBinding &binding)
    {
	   TimestampColumn tsc(*binding.time_ptr.get());
	   return tsc.ToValue();
    }

    Local<Value> QueryOperation::unbindParam(ParamBinding & param)
    {
	   Local<Value> v;

	   switch (param.js_type)
	   {
	   case ParamBinding::JS_STRING:
		  v = unbindString(param);
		  break;

	   case ParamBinding::JS_BOOLEAN:
		  v = unbindBoolean(param);
		  break;

	   case ParamBinding::JS_INT:
		  v = unbindInt32(param);
		  break;

	   case ParamBinding::JS_UINT:
		  v = unbindUint32(param);
		  break;

	   case ParamBinding::JS_DATE:
		  v = unbindDate(param);
		  break;

	   case ParamBinding::JS_NUMBER:
		  v = unbindNumber(param);
		  break;

	   default:
		  v = unbindNull(param);
		  break;
	   }

	   return v;
    }

    Local<Array> QueryOperation::UnbindParameters()
    {
	   nodeTypeFactory fact;
	   auto arr = fact.newArray(output_param_count);
	   int i = 0;

	   std::for_each(params.begin(), params.end(), [&](ParamBinding& param) mutable
	   {
		  switch (param.param_type)
		  {
		  case SQL_PARAM_OUTPUT:
		  case SQL_PARAM_INPUT_OUTPUT:
		  {
			 auto v = unbindParam(param);
			 arr->Set(i++, v);
		  }
		  break;

		  default:
			 break;
		  }
	   });
	   return arr;
    }

    bool QueryOperation::TryInvokeOdbc()
    {
	   return connection->TryExecute(query, params);
    }

    Local<Value> QueryOperation::CreateCompletionArg()
    {
	   return connection->GetMetaValue();
    }

    bool ReadRowOperation::TryInvokeOdbc()
    {
	   bool res = connection->TryReadRow();
	   return res;
    }

    Local<Value> ReadRowOperation::CreateCompletionArg()
    {
	   return connection->EndOfRows();
    }

    bool ReadColumnOperation::TryInvokeOdbc()
    {
	   return connection->TryReadColumn(column);
    }

    Local<Value> ReadColumnOperation::CreateCompletionArg()
    {
	   return connection->GetColumnValue();
    }

    bool ReadNextResultOperation::TryInvokeOdbc()
    {
	   return connection->TryReadNextResult();
    }

    Local<Value> ReadNextResultOperation::CreateCompletionArg()
    {
	   nodeTypeFactory fact;
	   auto more_meta = fact.newObject();
	   more_meta->Set(fact.newString("endOfResults"), connection->EndOfResults());
	   more_meta->Set(fact.newString("meta"), connection->GetMetaValue());

	   return more_meta;
    }

    bool CloseOperation::TryInvokeOdbc()
    {
	   return connection->TryClose();
    }

    Local<Value> CloseOperation::CreateCompletionArg()
    {
	   nodeTypeFactory fact;
	   return fact.null();
    }

    bool CollectOperation::TryInvokeOdbc()
    {
	   return connection->TryClose();
    }

    Local<Value> CollectOperation::CreateCompletionArg()
    {
	   nodeTypeFactory fact;
	   return fact.null();
    }

    // override to not call a callback
    void CollectOperation::CompleteForeground()
    {
    }

    bool BeginTranOperation::TryInvokeOdbc()
    {
	   return connection->TryBeginTran();
    }

    Local<Value> BeginTranOperation::CreateCompletionArg()
    {
	   nodeTypeFactory fact;
	   return fact.null();
    }

    bool EndTranOperation::TryInvokeOdbc()
    {
	   return connection->TryEndTran(completionType);
    }

    Local<Value> EndTranOperation::CreateCompletionArg()
    {
	   nodeTypeFactory fact;
	   return fact.null();
    }

    ProcedureOperation::ProcedureOperation(shared_ptr<OdbcConnection> connection, const wstring& query, Handle<Object> callback) :
	   QueryOperation(connection, query, callback)
    {
	   persists = true;
    }

    bool ProcedureOperation::TryInvokeOdbc()
    {
	   return connection->TryExecute(query, params);
    }

    Local<Value> ProcedureOperation::CreateCompletionArg()
    {
	   output_param = UnbindParameters();
	   return connection->GetMetaValue();
    }
}
