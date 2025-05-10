// In js_object_mapper.cpp
#include "js_object_mapper.h"
#include "odbc_row.h"
#include "odbc_driver_types.h"
#include "string_utils.h"

namespace mssql
{

  // Helper methods implementation
  std::string JsObjectMapper::safeGetString(const Napi::Object &obj, const std::string &prop, const std::string &defaultVal)
  {
    if (obj.Has(prop) && obj.Get(prop).IsString())
    {
      return obj.Get(prop).As<Napi::String>().Utf8Value();
    }
    return defaultVal;
  }

  int64_t JsObjectMapper::safeGetInt64(const Napi::Object &obj, const std::string &prop, int64_t defaultVal)
  {
    if (obj.Has(prop) && obj.Get(prop).IsNumber())
    {
      return obj.Get(prop).As<Napi::Number>().Int64Value();
    }
    return defaultVal;
  }

  int32_t JsObjectMapper::safeGetInt32(const Napi::Object &obj, const std::string &prop, int32_t defaultVal)
  {
    if (obj.Has(prop) && obj.Get(prop).IsNumber())
    {
      return obj.Get(prop).As<Napi::Number>().Int32Value();
    }
    return defaultVal;
  }

  bool JsObjectMapper::safeGetBool(const Napi::Object &obj, const std::string &prop, bool defaultVal)
  {
    if (obj.Has(prop) && obj.Get(prop).IsBoolean())
    {
      return obj.Get(prop).As<Napi::Boolean>().Value();
    }
    return defaultVal;
  }

  SqlParamValue JsObjectMapper::safeGetValue(const Napi::Object &obj, const std::string &prop)
  {
    if (!obj.Has(prop) || obj.Get(prop).IsNull() || obj.Get(prop).IsUndefined())
    {
      return nullptr;
    }

    Napi::Value val = obj.Get(prop);

    if (val.IsBoolean())
    {
      return val.As<Napi::Boolean>().Value();
    }
    else if (val.IsNumber())
    {
      // Try to deduce if it's an integer or a float
      double dVal = val.As<Napi::Number>().DoubleValue();
      int64_t iVal = val.As<Napi::Number>().Int64Value();

      if (dVal == static_cast<double>(iVal))
      {
        // It's an integer
        if (iVal >= INT32_MIN && iVal <= INT32_MAX)
        {
          return static_cast<int32_t>(iVal);
        }
        return iVal;
      }
      return dVal;
    }
    else if (val.IsString())
    {
      return val.As<Napi::String>().Utf8Value();
    }
    else if (val.IsBuffer())
    {
      Napi::Buffer<uint8_t> buffer = val.As<Napi::Buffer<uint8_t>>();
      return std::vector<uint8_t>(buffer.Data(), buffer.Data() + buffer.Length());
    }

    // Default to null for unsupported types
    return nullptr;
  }

  // Convert to Napi::Object for returning to JavaScript
  Napi::Object JsObjectMapper::fromStatementHandle(const Napi::Env &env, StatementHandle handle)
  {
    Napi::Object result = Napi::Object::New(env);
    result.Set("connectionId", Napi::Number::New(env, handle.getConnectionId()));
    result.Set("statementId", Napi::Number::New(env, handle.getStatementId()));

    return result;
  }

  // Move this inside the JsObjectMapper class implementation
  StatementHandle JsObjectMapper::toStatementHandle(const Napi::Object &jsObject)
  {
    int conn_id = jsObject.Get("connectionId").As<Napi::Number>().Int32Value();
    int stmt_id = jsObject.Get("statementId").As<Napi::Number>().Int32Value();
    return StatementHandle(conn_id, stmt_id);
  }

  // Main mapper implementation
  ProcedureParamMeta JsObjectMapper::toProcedureParamMeta(const Napi::Object &jsObject)
  {
    ProcedureParamMeta result;

    result.proc_name = safeGetString(jsObject, "proc_name");
    result.type_desc = safeGetString(jsObject, "type_desc");
    result.object_id = safeGetInt64(jsObject, "object_id");
    result.has_default_value = safeGetBool(jsObject, "has_default_value");
    result.default_value = safeGetString(jsObject, "default_value");
    result.is_output = safeGetBool(jsObject, "is_output");
    result.name = safeGetString(jsObject, "name");
    result.type_id = safeGetString(jsObject, "type_id");
    result.max_length = safeGetInt32(jsObject, "max_length");
    result.order = safeGetInt32(jsObject, "order");
    result.collation = safeGetString(jsObject, "collation");
    result.is_user_defined = safeGetBool(jsObject, "is_user_defined");

    return result;
  }

  NativeParam JsObjectMapper::toNativeParam(const Napi::Object &jsObject)
  {
    NativeParam result;

    result.is_user_defined = safeGetBool(jsObject, "is_user_defined");
    result.type_id = safeGetInt32(jsObject, "type_id");
    result.schema = safeGetString(jsObject, "schema");
    result.bcp = safeGetBool(jsObject, "bcp");
    result.bcp_version = safeGetInt32(jsObject, "bcp_version");
    result.table_name = safeGetString(jsObject, "table_name");
    result.ordinal_position = safeGetInt32(jsObject, "ordinal_position");
    result.scale = safeGetInt32(jsObject, "scale");
    result.offset = safeGetInt32(jsObject, "offset");
    result.precision = safeGetInt32(jsObject, "precision");
    result.is_output = safeGetBool(jsObject, "is_output");
    result.name = safeGetString(jsObject, "name");
    result.value = safeGetValue(jsObject, "value");

    return result;
  }

  Napi::Object JsObjectMapper::fromProcedureParamMeta(const Napi::Env &env, const ProcedureParamMeta &param)
  {
    Napi::Object result = Napi::Object::New(env);

    result.Set("proc_name", Napi::String::New(env, param.proc_name));
    result.Set("type_desc", Napi::String::New(env, param.type_desc));
    result.Set("object_id", Napi::Number::New(env, param.object_id));
    result.Set("has_default_value", Napi::Boolean::New(env, param.has_default_value));
    result.Set("default_value", Napi::String::New(env, param.default_value));
    result.Set("is_output", Napi::Boolean::New(env, param.is_output));
    result.Set("name", Napi::String::New(env, param.name));
    result.Set("type_id", Napi::String::New(env, param.type_id));
    result.Set("max_length", Napi::Number::New(env, param.max_length));
    result.Set("order", Napi::Number::New(env, param.order));
    result.Set("collation", Napi::String::New(env, param.collation));
    result.Set("is_user_defined", Napi::Boolean::New(env, param.is_user_defined));

    return result;
  }

  Napi::Object JsObjectMapper::fromColumnDefinition(const Napi::Env &env, const ColumnDefinition &colDef)
  {
    Napi::Object result = Napi::Object::New(env);

    // Convert SQLWCHAR array to std::string using our utility functions
    // In Linux, SQLWCHAR is unsigned short (16-bit), but wchar_t is 32-bit
    // So we need to use proper conversion
    std::string colName;
    if (colDef.colNameLen > 0)
    {
      colName = StringUtils::WideToUtf8(colDef.colName, colDef.colNameLen);
    }

    // Set properties on the JavaScript object
    result.Set("name", Napi::String::New(env, colName));
    result.Set("nameLength", Napi::Number::New(env, colDef.colNameLen));
    result.Set("dataType", Napi::Number::New(env, colDef.dataType));
    result.Set("columnSize", Napi::Number::New(env, colDef.columnSize));
    result.Set("decimalDigits", Napi::Number::New(env, colDef.decimalDigits));
    result.Set("nullable", Napi::Boolean::New(env, colDef.nullable != 0));

    return result;
  }

  Napi::Array JsObjectMapper::fromQueryResult(const Napi::Env &env, const QueryResult &result)
  {
    Napi::Array columns = Napi::Array::New(env, result.size());

    for (size_t i = 0; i < result.size(); i++)
    {
      ColumnDefinition colDef = result.get(i);
      columns[i] = fromColumnDefinition(env, colDef);
    }

    return columns;
  }

  Napi::Value JsObjectMapper::fromSqlParamValue(const Napi::Env &env, const SqlParamValue &value)
  {
    if (std::holds_alternative<std::nullptr_t>(value))
    {
      return env.Null();
    }
    else if (std::holds_alternative<bool>(value))
    {
      return Napi::Boolean::New(env, std::get<bool>(value));
    }
    else if (std::holds_alternative<int32_t>(value))
    {
      return Napi::Number::New(env, std::get<int32_t>(value));
    }
    else if (std::holds_alternative<int64_t>(value))
    {
      return Napi::Number::New(env, std::get<int64_t>(value));
    }
    else if (std::holds_alternative<double>(value))
    {
      return Napi::Number::New(env, std::get<double>(value));
    }
    else if (std::holds_alternative<std::string>(value))
    {
      return Napi::String::New(env, std::get<std::string>(value));
    }
    else if (std::holds_alternative<std::vector<uint8_t>>(value))
    {
      const auto &vec = std::get<std::vector<uint8_t>>(value);
      return Napi::Buffer<uint8_t>::Copy(env, vec.data(), vec.size());
    }

    return env.Null();
  }

  Napi::Object JsObjectMapper::fromNativeParam(const Napi::Env &env, const NativeParam &param)
  {
    Napi::Object result = Napi::Object::New(env);

    result.Set("is_user_defined", Napi::Boolean::New(env, param.is_user_defined));
    result.Set("type_id", Napi::Number::New(env, param.type_id));
    result.Set("schema", Napi::String::New(env, param.schema));
    result.Set("bcp", Napi::Boolean::New(env, param.bcp));
    result.Set("bcp_version", Napi::Number::New(env, param.bcp_version));
    result.Set("table_name", Napi::String::New(env, param.table_name));
    result.Set("ordinal_position", Napi::Number::New(env, param.ordinal_position));
    result.Set("scale", Napi::Number::New(env, param.scale));
    result.Set("offset", Napi::Number::New(env, param.offset));
    result.Set("precision", Napi::Number::New(env, param.precision));
    result.Set("is_output", Napi::Boolean::New(env, param.is_output));
    result.Set("name", Napi::String::New(env, param.name));
    result.Set("value", fromSqlParamValue(env, param.value));

    return result;
  }

  Napi::Object JsObjectMapper::fromOdbcRow(const Napi::Env &env, const std::shared_ptr<IOdbcRow> &row, const QueryResult &columnDefs)
  {
    Napi::Object jsRow = Napi::Object::New(env);

    // Iterate through each column in the row
    for (size_t colIdx = 0; colIdx < row->columnCount(); ++colIdx)
    {
      const auto &column = row->getColumn(colIdx);
      const auto &colDef = columnDefs.get(colIdx);
      const auto colName = colDef.colNameUtf8();

      // Check for NULL
      if (column.isNull())
      {
        jsRow.Set(colName, env.Null());
        continue;
      }
      const auto colType = column.getType();
      // Handle different data types based on column.getType()
      switch (colType)
      {
      case mssql::DatumStorage::SqlType::NChar:
      case mssql::DatumStorage::SqlType::NVarChar:
      case mssql::DatumStorage::SqlType::NText:
      {
        // Handle Unicode strings (SQLWCHAR)
        auto wcharVec = const_cast<mssql::DatumStorage &>(column).getTypedVector<uint16_t>();
        if (wcharVec && !wcharVec->empty())
        {
          jsRow.Set(colName, Napi::String::New(
                               env,
                               reinterpret_cast<const char16_t *>(wcharVec->data()),
                               wcharVec->size()));
        }
        else
        {
          jsRow.Set(colName, env.Null());
        }
        break;
      }

      case mssql::DatumStorage::SqlType::Char:
      case mssql::DatumStorage::SqlType::VarChar:
      case mssql::DatumStorage::SqlType::Text:
      {
        // Handle ASCII strings
        auto charVec = const_cast<mssql::DatumStorage &>(column).getTypedVector<char>();
        if (charVec && !charVec->empty())
        {
          std::string str(charVec->data(), charVec->size());
          // Remove null terminator if present
          if (!str.empty() && str.back() == '\0')
          {
            str.pop_back();
          }
          jsRow.Set(colName, Napi::String::New(env, str));
        }
        else
        {
          jsRow.Set(colName, env.Null());
        }
        break;
      }

      case mssql::DatumStorage::SqlType::Integer:
      {
        auto intVec = const_cast<mssql::DatumStorage &>(column).getTypedVector<int32_t>();
        if (intVec && !intVec->empty())
        {
          jsRow.Set(colName, Napi::Number::New(env, (*intVec)[0]));
        }
        break;
      }

      case mssql::DatumStorage::SqlType::BigInt:
      {
        auto bigintVec = const_cast<mssql::DatumStorage &>(column).getTypedVector<int64_t>();
        if (bigintVec && !bigintVec->empty())
        {
          // For BigInt, depending on the value, you might need to use BigInt in JS
          // For now, we'll use Number, but be cautious about precision loss
          const auto bigintValue = (*bigintVec)[0];
          jsRow.Set(colName, Napi::Number::New(env, static_cast<double>(bigintValue)));
        }
        break;
      }

      case mssql::DatumStorage::SqlType::Double:
      case mssql::DatumStorage::SqlType::Float:
      case mssql::DatumStorage::SqlType::Real:
      {
        auto doubleVec = const_cast<mssql::DatumStorage &>(column).getTypedVector<double>();
        if (doubleVec && !doubleVec->empty())
        {
          jsRow.Set(colName, Napi::Number::New(env, (*doubleVec)[0]));
        }
        break;
      }

      case mssql::DatumStorage::SqlType::Bit:
      {
        auto bitVec = const_cast<mssql::DatumStorage &>(column).getTypedVector<int8_t>();
        if (bitVec && !bitVec->empty())
        {
          jsRow.Set(colName, Napi::Boolean::New(env, (*bitVec)[0] != 0));
        }
        break;
      }

      case mssql::DatumStorage::SqlType::Date:
      {
        auto dateVec = const_cast<mssql::DatumStorage &>(column).getTypedVector<SQL_DATE_STRUCT>();
        if (dateVec && !dateVec->empty())
        {
          const auto &date = (*dateVec)[0];
          
          // Create a JS Date object
          napi_value jsDate;
          
          // Create a date with local timezone
          struct tm timeinfo = {};
          timeinfo.tm_year = date.year - 1900; // tm_year is years since 1900
          timeinfo.tm_mon = date.month - 1;    // tm_mon is 0-based
          timeinfo.tm_mday = date.day;
          timeinfo.tm_hour = 0;
          timeinfo.tm_min = 0;
          timeinfo.tm_sec = 0;

          // Convert to time_t (seconds since epoch)
          time_t rawtime = mktime(&timeinfo);
          
          // Convert to milliseconds
          double ms = static_cast<double>(rawtime) * 1000.0;
          
          napi_create_date(env, ms, &jsDate);
          jsRow.Set(colName, Napi::Value(env, jsDate));
        }
        break;
      }

      case mssql::DatumStorage::SqlType::Time:
      {
        auto timeVec = const_cast<mssql::DatumStorage &>(column).getTypedVector<SQL_SS_TIME2_STRUCT>();
        if (timeVec && !timeVec->empty())
        {
          const auto &time = (*timeVec)[0];
          
          // Create a JS Date using today's date with this time
          napi_value jsDate;
          
          // Get current date (for the base date)
          time_t now = std::time(nullptr);
          struct tm *tm_now = std::localtime(&now);
          tm_now->tm_hour = time.hour;
          tm_now->tm_min = time.minute;
          tm_now->tm_sec = time.second;
          
          // Convert to time_t (seconds since epoch)
          time_t time_with_today = mktime(tm_now);
          
          // Convert to milliseconds and add the fraction part
          double ms = static_cast<double>(time_with_today) * 1000.0 + 
                     static_cast<double>(time.fraction) / 1000000.0;
          
          napi_create_date(env, ms, &jsDate);
          jsRow.Set(colName, Napi::Value(env, jsDate));
        }
        break;
      }

      case mssql::DatumStorage::SqlType::DateTime:
      case mssql::DatumStorage::SqlType::DateTime2:
      {
        auto timestampVec = const_cast<mssql::DatumStorage &>(column).getTypedVector<SQL_TIMESTAMP_STRUCT>();
        if (timestampVec && !timestampVec->empty())
        {
          const auto &timestamp = (*timestampVec)[0];
          
          // Create a JS Date
          napi_value jsDate;
          
          // Create date with local timezone
          struct tm timeinfo = {};
          timeinfo.tm_year = timestamp.year - 1900; // tm_year is years since 1900
          timeinfo.tm_mon = timestamp.month - 1;    // tm_mon is 0-based
          timeinfo.tm_mday = timestamp.day;
          timeinfo.tm_hour = timestamp.hour;
          timeinfo.tm_min = timestamp.minute;
          timeinfo.tm_sec = timestamp.second;
          
          // Convert to time_t (seconds since epoch)
          time_t rawtime = mktime(&timeinfo);
          
          // Convert to milliseconds and add the fraction part
          double ms = static_cast<double>(rawtime) * 1000.0 + 
                    static_cast<double>(timestamp.fraction) / 1000000.0;
          
          napi_create_date(env, ms, &jsDate);
          jsRow.Set(colName, Napi::Value(env, jsDate));
        }
        break;
      }

      case mssql::DatumStorage::SqlType::DateTimeOffset:
      {
        auto offsetVec = const_cast<mssql::DatumStorage &>(column).getTypedVector<SQL_SS_TIMESTAMPOFFSET_STRUCT>();
        if (offsetVec && !offsetVec->empty())
        {
          const auto &offset = (*offsetVec)[0];
          
          // Create a JS Date with UTC time adjusted by offset
          napi_value jsDate;
          
          // Create date in UTC
          struct tm timeinfo = {};
          timeinfo.tm_year = offset.year - 1900;
          timeinfo.tm_mon = offset.month - 1;
          timeinfo.tm_mday = offset.day;
          timeinfo.tm_hour = offset.hour;
          timeinfo.tm_min = offset.minute;
          timeinfo.tm_sec = offset.second;
          
          // Apply timezone offset
          timeinfo.tm_hour -= offset.timezone_hour;
          timeinfo.tm_min -= offset.timezone_minute;
          
          // Convert to time_t with GMT timezone
          time_t rawtime;
#ifdef _WIN32
          // Windows doesn't have timegm, use _mkgmtime
          rawtime = _mkgmtime(&timeinfo);
#else
          // Use timegm for UTC time on Linux/Unix
          timeinfo.tm_isdst = 0; // No DST adjustment for UTC time
          rawtime = timegm(&timeinfo);
#endif
          
          // Convert to milliseconds and add the fraction part
          double ms = static_cast<double>(rawtime) * 1000.0 + 
                    static_cast<double>(offset.fraction) / 1000000.0;
          
          napi_create_date(env, ms, &jsDate);
          jsRow.Set(colName, Napi::Value(env, jsDate));
        }
        break;
      }

      case mssql::DatumStorage::SqlType::Binary:
      case mssql::DatumStorage::SqlType::VarBinary:
      {
        auto binaryVec = const_cast<mssql::DatumStorage &>(column).getTypedVector<char>();
        if (binaryVec && !binaryVec->empty())
        {
          // Create a Buffer for binary data
          auto buffer = Napi::Buffer<char>::Copy(
              env, binaryVec->data(), binaryVec->size());
          jsRow.Set(colName, buffer);
        }
        break;
      }

      default:
        // For unsupported types, convert to string representation
        jsRow.Set(colName, Napi::String::New(env, "[Unsupported type]"));
        break;
      }
    }

    return jsRow;
  }
}