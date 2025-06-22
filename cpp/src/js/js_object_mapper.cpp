// In js_object_mapper.cpp
#include <js/js_object_mapper.h>

#include <js/js_time_adapter.h>
#include <odbc/odbc_driver_types.h>
#include <odbc/odbc_row.h>
#include <common/string_utils.h>
#include <utils/Logger.h>
#include <odbc/odbc_type_mapper.h>
#include <js/columns/result_set.h>

namespace mssql {
// Helper methods implementation
std::string JsObjectMapper::safeGetString(const Napi::Object& obj,
                                          const std::string& prop,
                                          const std::string& defaultVal) {
  if (obj.Has(prop) && obj.Get(prop).IsString()) {
    return obj.Get(prop).As<Napi::String>().Utf8Value();
  }
  return defaultVal;
}

std::u16string JsObjectMapper::safeGetWideString(const Napi::Object& obj,
                                                 const std::string& prop,
                                                 const std::u16string& defaultVal) {
  if (obj.Has(prop) && obj.Get(prop).IsString()) {
    return obj.Get(prop).As<Napi::String>().Utf16Value();
  }
  return defaultVal;
}

int64_t JsObjectMapper::safeGetInt64(const Napi::Object& obj,
                                     const std::string& prop,
                                     int64_t defaultVal) {
  if (obj.Has(prop) && obj.Get(prop).IsNumber()) {
    return obj.Get(prop).As<Napi::Number>().Int64Value();
  }
  return defaultVal;
}

int32_t JsObjectMapper::safeGetInt32(const Napi::Object& obj,
                                     const std::string& prop,
                                     int32_t defaultVal) {
  if (obj.Has(prop) && obj.Get(prop).IsNumber()) {
    return obj.Get(prop).As<Napi::Number>().Int32Value();
  }
  return defaultVal;
}

int32_t JsObjectMapper::safeGetInt32(const Napi::Object& obj, int32_t defaultVal) {
  if (obj.IsNumber()) {
    return obj.As<Napi::Number>().Int32Value();
  }
  return defaultVal;
}

int64_t JsObjectMapper::safeGetInt64(const Napi::Object& obj, int64_t defaultVal) {
  if (obj.IsNumber()) {
    return obj.As<Napi::Number>().Int64Value();
  }
  return defaultVal;
}

bool JsObjectMapper::safeGetBool(const Napi::Object& obj,
                                 const std::string& prop,
                                 bool defaultVal) {
  if (obj.Has(prop) && obj.Get(prop).IsBoolean()) {
    return obj.Get(prop).As<Napi::Boolean>().Value();
  }
  return defaultVal;
}

Napi::Object JsObjectMapper::fromQueryResult(const Napi::Env& env,
                                             const std::shared_ptr<ResultSet>& resultset) {
  auto result = Napi::Object::New(env);

  result.Set("endOfRows", resultset->EndOfRows());
  result.Set("endOfResults", resultset->EndOfResults());
  result.Set("rowCount", resultset->row_count());

  const auto number_rows = resultset->get_result_count();
  const auto column_count = static_cast<int>(resultset->get_column_count());
  auto results_array = Napi::Array::New(env, static_cast<int>(number_rows));

  // The JavaScript layer expects "data" property containing array of rows
  result.Set("data", results_array);

  for (size_t row_id = 0; row_id < number_rows; ++row_id) {
    auto row_array = Napi::Array::New(env, column_count);
    results_array.Set(static_cast<uint32_t>(row_id), row_array);
    for (auto c = 0; c < column_count; ++c) {
      row_array.Set(static_cast<uint32_t>(c), resultset->get_column(row_id, c)->ToValue(env));
    }
  }

  return result;
}

// Convert to Napi::Object for returning to JavaScript
Napi::Object JsObjectMapper::fromStatementHandle(const Napi::Env& env, StatementHandle handle) {
  Napi::Object result = Napi::Object::New(env);
  result.Set("connectionId", Napi::Number::New(env, handle.getConnectionId()));
  result.Set("statementId", Napi::Number::New(env, handle.getStatementId()));

  return result;
}

std::shared_ptr<QueryOperationParams> JsObjectMapper::toQueryOperationParams(
    const Napi::Object& jsObject) {
  std::shared_ptr<QueryOperationParams> result = std::make_shared<QueryOperationParams>();
  result->query_string = safeGetWideString(jsObject, "query_str");
  result->timeout = safeGetInt32(jsObject, "query_timeout");
  result->query_tz_adjustment = safeGetInt32(jsObject, "query_tz_adjustment");
  result->id = safeGetInt64(jsObject, "query_id");
  result->max_prepared_column_size = safeGetInt32(jsObject, "max_prepared_column_size");
  result->numeric_string = safeGetBool(jsObject, "numeric_string");
  result->polling = safeGetBool(jsObject, "query_polling");
  return result;
}

NativeParam JsObjectMapper::toNativeParam(const Napi::Object& jsObject) {
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

  return result;
}

// Move this inside the JsObjectMapper class implementation
StatementHandle JsObjectMapper::toStatementHandle(const Napi::Object& jsObject) {
  int conn_id = jsObject.Get("connectionId").As<Napi::Number>().Int32Value();
  int stmt_id = jsObject.Get("statementId").As<Napi::Number>().Int32Value();
  return StatementHandle(conn_id, stmt_id);
}

// Main mapper implementation
ProcedureParamMeta JsObjectMapper::toProcedureParamMeta(const Napi::Object& jsObject) {
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

QueryOptions JsObjectMapper::toQueryOptions(const Napi::Object& jsObject) {
  QueryOptions result;

  result.as_objects = safeGetBool(jsObject, "asObjects");
  result.as_arrays = safeGetBool(jsObject, "asArrays");
  result.batch_size = safeGetInt32(jsObject, "batchSize");

  return result;
}

// Helper function to decode SqlParamValue into DatumStorage
void JsObjectMapper::decodeIntoStorage(const Napi::Object& jsObject, SqlParameter& param) {
  // Local template function for writing int values
  auto writeInt = [](SqlParameter& param, auto value, bool isNull) {
    using T = decltype(value);
    static_assert(std::is_integral<T>::value, "writeInt can only be used with integral types");

    if (!isNull) {
      param.storage->addValue<T>(value);
      param.indvec.emplace_back(0);  // Not NULL
    } else {
      param.storage->addValue<T>(static_cast<T>(0));  // Add dummy value
      param.indvec.emplace_back(SQL_NULL_DATA);       // Mark as NULL
    }
  };

  // Local template function for handling numeric types
  auto decodeNumericType = [&](const Napi::Object& jsObject,
                               SqlParameter& param,
                               bool isArray,
                               const Napi::Array& asArray,
                               bool isNull,
                               auto typeTag) {
    using T = decltype(typeTag);
    if (isArray) {
      for (size_t i = 0; i < asArray.Length(); i++) {
        isNull = false;
        Napi::Value element = asArray[i];
        if (element.IsNull() || element.IsUndefined()) {
          isNull = true;
        }
        Napi::Object obj = element.As<Napi::Object>();
        const auto v = safeGetInt32(obj, static_cast<int32_t>(0));
        writeInt(param, static_cast<T>(v), isNull);
      }
    } else {
      const auto v = safeGetInt32(jsObject, "value");
      writeInt(param, static_cast<T>(v), isNull);
    }
  };

  // Local function for handling BigInt types (needs int64 handling)
  auto decodeBigIntType = [&](const Napi::Object& jsObject,
                              SqlParameter& param,
                              bool isArray,
                              const Napi::Array& asArray,
                              bool isNull) {
    if (isArray) {
      for (size_t i = 0; i < asArray.Length(); i++) {
        Napi::Value element = asArray[i];
        Napi::Object obj = element.As<Napi::Object>();
        const auto v = safeGetInt64(obj, static_cast<int64_t>(0));
        writeInt(param, v, isNull);
      }
    } else {
      const auto v = safeGetInt64(jsObject, "value");
      writeInt(param, v, isNull);
    }
  };
  // Create storage if it doesn't exist
  if (!param.storage) {
    param.storage = std::make_shared<mssql::DatumStorage>();
  }

  // Set the appropriate SQL type in the DatumStorage
  DatumStorage::SqlType storageType = DatumStorage::getTypeFromName(param.sql_type);
  param.storage->setType(storageType);

  bool isNull = false;

  if (!jsObject.Has("value")) {
    isNull = true;
  }

  if (jsObject.Get("value").IsNull() || jsObject.Get("value").IsUndefined()) {
    isNull = true;
  }
  bool isArray = false;

  if (!isNull) {
    isArray = jsObject.Get("value").IsArray();
  }

  Napi::Array asArray = isArray ? jsObject.Get("value").As<Napi::Array>() : Napi::Array::New(0);

  // Set array parameter flags
  if (isArray) {
    param.is_array = true;
    param.array_length = asArray.Length();
  }

  switch (storageType) {
    case DatumStorage::SqlType::TinyInt:
      decodeNumericType(jsObject, param, isArray, asArray, isNull, int8_t{});
      break;
    case DatumStorage::SqlType::SmallInt:
      decodeNumericType(jsObject, param, isArray, asArray, isNull, int16_t{});
      break;
    case DatumStorage::SqlType::Integer:
      decodeNumericType(jsObject, param, isArray, asArray, isNull, int32_t{});
      break;
    case DatumStorage::SqlType::BigInt:
      decodeBigIntType(jsObject, param, isArray, asArray, isNull);
      break;

    default:
      throw std::runtime_error("Unsupported SQL type");
  }
}

std::shared_ptr<SqlParameter> JsObjectMapper::toSqlParameter(const Napi::Object& jsObject) {
  std::shared_ptr<SqlParameter> result = std::make_shared<SqlParameter>();

  result->type = safeGetString(jsObject, "type");
  result->sql_type = safeGetString(jsObject, "sqlType");
  result->js_type = safeGetString(jsObject, "jsType");
  result->c_type = safeGetString(jsObject, "cType");
  result->precision = safeGetInt32(jsObject, "precision");
  result->scale = safeGetInt32(jsObject, "scale");
  result->param_size = safeGetInt32(jsObject, "paramSize");
  result->buffer_len = safeGetInt32(jsObject, "bufferLen");
  result->encoding = safeGetString(jsObject, "encoding", "utf8");
  result->param_type = safeGetString(jsObject, "paramType", "SQL_PARAM_INPUT");
  result->digits = safeGetInt32(jsObject, "digits");
  decodeIntoStorage(jsObject, *result);

  return result;
}

Napi::Object JsObjectMapper::fromStatementStateChange(const Napi::Env& env,
                                                      const StatementStateChange& stateChange) {
  Napi::Object result = Napi::Object::New(env);
  result.Set("handle", fromStatementHandle(env, stateChange.statementHandle));
  result.Set("oldState", Napi::String::New(env, stateChange.oldState));
  result.Set("newState", Napi::String::New(env, stateChange.newState));

  return result;
}

Napi::Object JsObjectMapper::fromProcedureParamMeta(const Napi::Env& env,
                                                    const ProcedureParamMeta& param) {
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

Napi::Object JsObjectMapper::fromColumnDefinition(const Napi::Env& env,
                                                  const ColumnDefinition& colDef) {
  Napi::Object result = Napi::Object::New(env);

  // Convert SQLWCHAR array to std::string using our utility functions
  // In Linux, SQLWCHAR is unsigned short (16-bit), but wchar_t is 32-bit
  // So we need to use proper conversion
  std::string colName;
  if (colDef.colNameLen > 0) {
    colName = StringUtils::WideToUtf8(colDef.name.data(), colDef.colNameLen);
  }

  std::string jsType = OdbcTypeMapper::MapSqlTypeToJsType(colDef.dataType);

  auto name = Napi::String::New(
      env, reinterpret_cast<const char16_t*>(colDef.name.data()), colDef.colNameLen);

  // Set properties on the JavaScript object
  // result.Set("size", Napi::Number::New(env, colDef.colNameLen));
  result.Set("name", name);
  result.Set("nullable", Napi::Boolean::New(env, colDef.nullable != 0));
  result.Set("type", Napi::String::New(env, jsType));
  result.Set("sqlType", Napi::Number::New(env, colDef.dataType));
  result.Set("size", Napi::Number::New(env, colDef.columnSize));
  result.Set("sqlType", Napi::String::New(env, colDef.dataTypeName));
  if (colDef.dataType == SQL_SS_UDT) {
    result.Set("udtType", Napi::String::New(env, colDef.udtTypeName));
  }
  // result.Set("decimalDigits", Napi::Number::New(env, colDef.decimalDigits));

  return result;
}

Napi::Array JsObjectMapper::fromQueryResult(const Napi::Env& env, const QueryResult& result) {
  Napi::Array columns = Napi::Array::New(env, result.size());

  for (size_t i = 0; i < result.size(); i++) {
    ColumnDefinition colDef = result.get(i);
    columns[i] = fromColumnDefinition(env, colDef);
  }

  return columns;
}

Napi::Error JsObjectMapper::fromOdbcError(const Napi::Env& env, const OdbcError& error) {
  Napi::Error result = Napi::Error::New(env);

  // Add ODBC-specific properties to the Error object

  result.Set("sqlstate", Napi::String::New(env, error.sqlstate));
  result.Set("message", Napi::String::New(env, error.message));
  result.Set("code", Napi::Number::New(env, error.code));
  result.Set("severity", Napi::Number::New(env, error.severity));
  result.Set("serverName", Napi::String::New(env, error.serverName));
  result.Set("procName", Napi::String::New(env, error.procName));
  result.Set("lineNumber", Napi::Number::New(env, error.lineNumber));

  return result;
}

Napi::Object JsObjectMapper::fromNativeQueryResult(const Napi::Env& env,
                                                   const std::shared_ptr<QueryResult> queryResult) {
  Napi::Array columns = Napi::Array::New(env);

  // Populate the array with column metadata
  for (size_t i = 0; i < queryResult->size(); i++) {
    ColumnDefinition colDef = queryResult->get(i);
    columns[i] = JsObjectMapper::fromColumnDefinition(env, colDef);
  }

  // Create a metadata object to return
  Napi::Object metadata = Napi::Object::New(env);
  Napi::Object handle = JsObjectMapper::fromStatementHandle(env, queryResult->getHandle());
  metadata.Set("meta", columns);
  metadata.Set("handle", handle);
  metadata.Set("endOfRows", Napi::Boolean::New(env, queryResult->is_end_of_rows()));
  metadata.Set("endOfResults", Napi::Boolean::New(env, queryResult->is_end_of_results()));
  metadata.Set("rowCount", Napi::Number::New(env, queryResult->get_row_count()));

  return metadata;
}

Napi::Object JsObjectMapper::fromSqlParameter(const Napi::Env& env, const SqlParameter& param) {
  Napi::Object result = Napi::Object::New(env);

  result.Set("type", Napi::String::New(env, param.type));
  result.Set("sqlType", Napi::String::New(env, param.sql_type));
  result.Set("jsType", Napi::String::New(env, param.js_type));
  result.Set("cType", Napi::String::New(env, param.c_type));
  result.Set("precision", Napi::Number::New(env, param.precision));
  result.Set("scale", Napi::Number::New(env, param.scale));
  // Handle param_size which could be string
  if (param.param_size == 0) {
    // Could be SQL_VARLEN_DATA or similar
    result.Set("paramSize", Napi::String::New(env, "SQL_VARLEN_DATA"));
  } else {
    result.Set("paramSize", Napi::Number::New(env, param.param_size));
  }
  result.Set("bufferLen", Napi::Number::New(env, param.buffer_len));
  result.Set("encoding", Napi::String::New(env, param.encoding));
  // result.Set("value", fromSqlParamValue(env, param.value));

  return result;
}

// Helper methods for handling different types
void JsObjectMapper::handleNullValue(const Napi::Env& env, JsValueTarget& jsWriter) {
  jsWriter.setNull(env);
}

bool JsObjectMapper::handleStringTypes(const Napi::Env& env,
                                       JsValueTarget& jsWriter,
                                       const DatumStorage& column,
                                       DatumStorage::SqlType colType) {
  // Handle both wide and ASCII strings
  if (colType == DatumStorage::SqlType::NChar || colType == DatumStorage::SqlType::NVarChar ||
      colType == DatumStorage::SqlType::NText) {
    // Handle Unicode strings (SQLWCHAR)
    auto wcharVec = const_cast<DatumStorage&>(column).getTypedVector<uint16_t>();
    if (wcharVec && !wcharVec->empty()) {
      jsWriter.setValue(
          env,
          Napi::String::New(
              env, reinterpret_cast<const char16_t*>(wcharVec->data()), wcharVec->size()));
    } else {
      handleNullValue(env, jsWriter);
    }
  } else {
    // Handle ASCII strings
    auto charVec = const_cast<DatumStorage&>(column).getTypedVector<char>();
    if (charVec && !charVec->empty()) {
      std::string str(charVec->data(), charVec->size());
      // Remove null terminator if present
      if (!str.empty() && str.back() == '\0') {
        str.pop_back();
      }
      jsWriter.setValue(env, Napi::String::New(env, str));
    } else {
      handleNullValue(env, jsWriter);
    }
  }
  return true;
}

bool JsObjectMapper::handleTinyInt(const Napi::Env& env,
                                   JsValueTarget& jsWriter,
                                   const DatumStorage& column) {
  try {
    auto int8Vec = const_cast<DatumStorage&>(column).getTypedVector<int8_t>();
    if (int8Vec && !int8Vec->empty()) {
      // Use int for TinyInt to avoid treating it as a character
      jsWriter.setValue(env, Napi::Number::New(env, static_cast<int>((*int8Vec)[0])));
    } else {
      handleNullValue(env, jsWriter);
    }
  } catch (const std::exception& e) {
    Logger::GetInstance().Log(LogLevel::Warning,
                              "JsObjectMapper: Exception with TinyInt type for column " +
                                  jsWriter.description() + ": " + e.what());

    // Try to read as raw data
    try {
      auto rawVec = const_cast<DatumStorage&>(column).getTypedVector<char>();
      if (rawVec && !rawVec->empty()) {
        // Read as int8_t but present as int to avoid treating as char
        int8_t val = rawVec->at(0);
        jsWriter.setValue(env, Napi::Number::New(env, static_cast<int>(val)));
      } else {
        handleNullValue(env, jsWriter);
      }
    } catch (...) {
      handleNullValue(env, jsWriter);
    }
  }
  return true;
}

bool JsObjectMapper::handleSmallInt(const Napi::Env& env,
                                    JsValueTarget& jsWriter,
                                    const DatumStorage& column) {
  try {
    auto int16Vec = const_cast<DatumStorage&>(column).getTypedVector<int16_t>();
    if (int16Vec && !int16Vec->empty()) {
      jsWriter.setValue(env, Napi::Number::New(env, (*int16Vec)[0]));
    } else {
      handleNullValue(env, jsWriter);
    }
  } catch (const std::exception& e) {
    Logger::GetInstance().Log(LogLevel::Warning,
                              "JsObjectMapper: Exception with SmallInt type for column " +
                                  jsWriter.description() + ": " + e.what());

    // Try to read as raw data
    try {
      auto rawVec = const_cast<DatumStorage&>(column).getTypedVector<char>();
      if (rawVec && rawVec->size() >= 2) {
        // Read as int16_t
        int16_t val = *reinterpret_cast<int16_t*>(rawVec->data());
        jsWriter.setValue(env, Napi::Number::New(env, val));
      } else {
        handleNullValue(env, jsWriter);
      }
    } catch (...) {
      handleNullValue(env, jsWriter);
    }
  }
  return true;
}

bool JsObjectMapper::handleInteger(const Napi::Env& env,
                                   JsValueTarget& jsWriter,
                                   const DatumStorage& column) {
  try {
    auto intVec = const_cast<DatumStorage&>(column).getTypedVector<int32_t>();
    if (intVec && !intVec->empty()) {
      const auto val = (*intVec)[0];
      jsWriter.setValue(env, Napi::Number::New(env, val));
    } else {
      handleNullValue(env, jsWriter);
    }
  } catch (const std::exception& e) {
    Logger::GetInstance().Log(LogLevel::Warning,
                              "JsObjectMapper: Exception with Integer type for column " +
                                  jsWriter.description() + ": " + e.what());

    // Try to read as raw data
    try {
      auto rawVec = const_cast<DatumStorage&>(column).getTypedVector<char>();
      if (rawVec && rawVec->size() >= 4) {
        // Read as int32_t
        int32_t val = *reinterpret_cast<int32_t*>(rawVec->data());
        jsWriter.setValue(env, Napi::Number::New(env, val));
      } else {
        handleNullValue(env, jsWriter);
      }
    } catch (...) {
      handleNullValue(env, jsWriter);
    }
  }
  return true;
}

bool JsObjectMapper::handleBigInt(const Napi::Env& env,
                                  JsValueTarget& jsWriter,
                                  const DatumStorage& column) {
  // BigInt type is defined as long long int (bigint_t) in DatumStorage
  Logger::GetInstance().Log(
      LogLevel::Debug,
      "JsObjectMapper: Processing BigInt type for column: " + jsWriter.description());

  // Try multiple approaches to get the BigInt value
  try {
    auto bigintVec = const_cast<DatumStorage&>(column).getTypedVector<DatumStorage::bigint_t>();
    if (bigintVec && !bigintVec->empty()) {
      const auto bigintValue = (*bigintVec)[0];
      Logger::GetInstance().Log(
          LogLevel::Debug,
          "JsObjectMapper: Successfully retrieved BigInt value: " + std::to_string(bigintValue));

      // For values that can be represented accurately as a Number in JavaScript
      if (bigintValue >= -9007199254740991LL && bigintValue <= 9007199254740991LL) {
        jsWriter.setValue(env, Napi::Number::New(env, static_cast<double>(bigintValue)));
      } else {
        // For large values outside JavaScript Number safe range, use BigInt
        jsWriter.setValue(env, Napi::BigInt::New(env, static_cast<int64_t>(bigintValue)));
      }
    } else {
      handleNullValue(env, jsWriter);
    }
  } catch (const std::exception& e) {
    Logger::GetInstance().Log(
        LogLevel::Error,
        "JsObjectMapper: Exception when processing BigInt: " + std::string(e.what()));

    // Fallback: try with int64_t directly
    try {
      auto intVec = const_cast<DatumStorage&>(column).getTypedVector<int64_t>();
      if (intVec && !intVec->empty()) {
        const auto intValue = (*intVec)[0];
        Logger::GetInstance().Log(LogLevel::Debug,
                                  "JsObjectMapper: Fallback to int64_t succeeded with value: " +
                                      std::to_string(intValue));

        // For values that can be represented accurately as a Number in JavaScript
        if (intValue >= -9007199254740991LL && intValue <= 9007199254740991LL) {
          jsWriter.setValue(env, Napi::Number::New(env, static_cast<double>(intValue)));
        } else {
          // For large values outside JavaScript Number safe range, use BigInt
          jsWriter.setValue(env, Napi::BigInt::New(env, static_cast<int64_t>(intValue)));
        }
      } else {
        handleNullValue(env, jsWriter);
      }
    } catch (const std::exception& e2) {
      Logger::GetInstance().Log(
          LogLevel::Error,
          "JsObjectMapper: Both BigInt retrieval approaches failed: " + std::string(e2.what()));
      handleNullValue(env, jsWriter);
    }
  }
  return true;
}

bool JsObjectMapper::handleFloatingPoint(const Napi::Env& env,
                                         JsValueTarget& jsWriter,
                                         const DatumStorage& column) {
  auto doubleVec = const_cast<DatumStorage&>(column).getTypedVector<double>();
  if (doubleVec && !doubleVec->empty()) {
    jsWriter.setValue(env, Napi::Number::New(env, (*doubleVec)[0]));
  } else {
    handleNullValue(env, jsWriter);
  }
  return true;
}

bool JsObjectMapper::handleBit(const Napi::Env& env,
                               JsValueTarget& jsWriter,
                               const DatumStorage& column) {
  auto bitVec = const_cast<DatumStorage&>(column).getTypedVector<int8_t>();
  if (bitVec && !bitVec->empty()) {
    jsWriter.setValue(env, Napi::Boolean::New(env, (*bitVec)[0] != 0));
  } else {
    handleNullValue(env, jsWriter);
  }
  return true;
}

bool JsObjectMapper::handleDateTimeTypes(const Napi::Env& env,
                                         JsValueTarget& jsWriter,
                                         const DatumStorage& column,
                                         DatumStorage::SqlType colType) {
  switch (colType) {
    case DatumStorage::SqlType::Date: {
      auto dateVec = const_cast<DatumStorage&>(column).getTypedVector<SQL_DATE_STRUCT>();
      if (dateVec && !dateVec->empty()) {
        const auto& date = (*dateVec)[0];
        napi_value jsDate = JSTimeAdapter::createJsDateFromDate(env, date);
        jsWriter.setValue(env, Napi::Value(env, jsDate));
      } else {
        handleNullValue(env, jsWriter);
      }
      break;
    }

    case DatumStorage::SqlType::Time: {
      auto timeVec = const_cast<DatumStorage&>(column).getTypedVector<SQL_SS_TIME2_STRUCT>();
      if (timeVec && !timeVec->empty()) {
        const auto& time = (*timeVec)[0];
        napi_value jsDate = JSTimeAdapter::createJsDateFromTime(env, time);
        jsWriter.setValue(env, Napi::Value(env, jsDate));
      } else {
        handleNullValue(env, jsWriter);
      }
      break;
    }

    case DatumStorage::SqlType::DateTime:
    case DatumStorage::SqlType::DateTime2: {
      auto timestampVec = const_cast<DatumStorage&>(column).getTypedVector<SQL_TIMESTAMP_STRUCT>();
      if (timestampVec && !timestampVec->empty()) {
        const auto& timestamp = (*timestampVec)[0];
        napi_value jsDate = JSTimeAdapter::createJsDateFromTimestamp(env, timestamp);
        jsWriter.setValue(env, Napi::Value(env, jsDate));
      } else {
        handleNullValue(env, jsWriter);
      }
      break;
    }

    case DatumStorage::SqlType::DateTimeOffset: {
      auto offsetVec =
          const_cast<DatumStorage&>(column).getTypedVector<SQL_SS_TIMESTAMPOFFSET_STRUCT>();
      if (offsetVec && !offsetVec->empty()) {
        const auto& offset = (*offsetVec)[0];
        napi_value jsDate = JSTimeAdapter::createJsDateFromTimestampOffset(env, offset);
        jsWriter.setValue(env, Napi::Value(env, jsDate));
      } else {
        handleNullValue(env, jsWriter);
      }
      break;
    }

    default:
      handleNullValue(env, jsWriter);
      return false;
  }
  return true;
}

bool JsObjectMapper::handleBinaryTypes(const Napi::Env& env,
                                       JsValueTarget& jsWriter,
                                       const DatumStorage& column) {
  try {
    auto binaryVec = const_cast<DatumStorage&>(column).getTypedVector<char>();
    if (!binaryVec) {
      Logger::GetInstance().Log(LogLevel::Warning,
                                "JsObjectMapper: Null vector returned for binary data in column " +
                                    jsWriter.description());
      handleNullValue(env, jsWriter);
      return false;
    }

    // For binary data, we treat empty data as an empty buffer, not null
    // This maintains distinction between NULL and empty binary in SQL
    if (binaryVec->empty()) {
      Logger::GetInstance().Log(
          LogLevel::Debug,
          "JsObjectMapper: Empty binary data for column " + jsWriter.description());
      // Create empty buffer (0 length)
      auto emptyBuffer = Napi::Buffer<char>::New(env, 0);
      jsWriter.setValue(env, emptyBuffer);
    } else {
      // Check for null data pointer (safety)
      if (!binaryVec->data()) {
        Logger::GetInstance().Log(
            LogLevel::Warning,
            "JsObjectMapper: Binary vector has null data pointer for column " +
                jsWriter.description());
        handleNullValue(env, jsWriter);
        return false;
      }

      // Create a Buffer for binary data
      auto buffer = Napi::Buffer<char>::Copy(env, binaryVec->data(), binaryVec->size());
      jsWriter.setValue(env, buffer);

      Logger::GetInstance().Log(LogLevel::Debug,
                                "JsObjectMapper: Binary data converted to buffer, size = " +
                                    std::to_string(binaryVec->size()) + " for column " +
                                    jsWriter.description());
    }
  } catch (const std::exception& e) {
    Logger::GetInstance().Log(LogLevel::Warning,
                              "JsObjectMapper: Exception with Binary type for column " +
                                  jsWriter.description() + ": " + e.what());
    handleNullValue(env, jsWriter);
    return false;
  }
  return true;
}

bool JsObjectMapper::handleVariantType(const Napi::Env& env,
                                       JsValueTarget& jsWriter,
                                       const DatumStorage& column) {
  // For Variant type, try to get the raw data and convert it to a string or number
  Logger::GetInstance().Log(
      LogLevel::Info,
      "JsObjectMapper: Handling Variant type for column: " + jsWriter.description());

  // Try various approaches to extract data
  try {
    // First try as int32
    auto int32Vec = const_cast<DatumStorage&>(column).getTypedVector<int32_t>();
    if (int32Vec && !int32Vec->empty()) {
      jsWriter.setValue(env, Napi::Number::New(env, (*int32Vec)[0]));
      return true;
    }
  } catch (...) {
    // Continue trying other types
  }

  try {
    // Then try as int64
    auto int64Vec = const_cast<DatumStorage&>(column).getTypedVector<int64_t>();
    if (int64Vec && !int64Vec->empty()) {
      jsWriter.setValue(env, Napi::Number::New(env, static_cast<double>((*int64Vec)[0])));
      return true;
    }
  } catch (...) {
    // Continue trying other types
  }

  try {
    // Try as char (string)
    auto charVec = const_cast<DatumStorage&>(column).getTypedVector<char>();
    if (charVec && !charVec->empty()) {
      std::string str(charVec->data(), charVec->size());
      jsWriter.setValue(env, Napi::String::New(env, str));
      return true;
    }
  } catch (...) {
    // Continue trying other types
  }

  try {
    // Try as uint16_t (wide string)
    auto wcharVec = const_cast<DatumStorage&>(column).getTypedVector<uint16_t>();
    if (wcharVec && !wcharVec->empty()) {
      jsWriter.setValue(
          env,
          Napi::String::New(
              env, reinterpret_cast<const char16_t*>(wcharVec->data()), wcharVec->size()));
      return true;
    }
  } catch (...) {
    // Continue trying other types
  }

  // If all fails, return as string
  jsWriter.setValue(env, Napi::String::New(env, "[Variant]"));
  return true;
}

bool JsObjectMapper::handleUnknownType(const Napi::Env& env,
                                       JsValueTarget& jsWriter,
                                       const DatumStorage& column) {
  // For unsupported types, add logging and convert to string representation
  const auto typeName = column.getTypeName();
  const auto sqlTypeValue = static_cast<int>(column.getType());
  Logger::GetInstance().Log(LogLevel::Warning,
                            "JsObjectMapper: Unsupported type encountered: " + typeName +
                                " (Type ID: " + std::to_string(sqlTypeValue) +
                                ") for column: " + jsWriter.description());

  // As a fallback, try to extract raw data
  try {
    // Try byte array
    auto rawVec = const_cast<DatumStorage&>(column).getTypedVector<char>();
    if (rawVec && !rawVec->empty()) {
      // Try to interpret as a number if it's 4 or 8 bytes
      if (rawVec->size() == 4) {
        // Interpret as int32
        int32_t val = *reinterpret_cast<int32_t*>(rawVec->data());
        jsWriter.setValue(env, Napi::Number::New(env, val));
        return true;
      } else if (rawVec->size() == 8) {
        // Interpret as int64
        int64_t val = *reinterpret_cast<int64_t*>(rawVec->data());
        jsWriter.setValue(env, Napi::Number::New(env, static_cast<double>(val)));
        return true;
      } else {
        // Return as buffer
        auto buffer = Napi::Buffer<char>::Copy(env, rawVec->data(), rawVec->size());
        jsWriter.setValue(env, buffer);
        return true;
      }
    }
  } catch (...) {
    // Continue to last resort
  }

  // Last resort: return a string representation
  jsWriter.setValue(env, Napi::String::New(env, "[Unknown type: " + typeName + "]"));
  return true;
}

bool JsObjectMapper::handleColumn(const Napi::Env& env,
                                  JsValueTarget& jsWriter,
                                  const DatumStorage& column,
                                  const ColumnDefinition& colDef) {
  // Get column type and dispatch to appropriate handler
  const auto colType = column.getType();
  bool handled = false;
  switch (colType) {
    // String types
    case mssql::DatumStorage::SqlType::NChar:
    case mssql::DatumStorage::SqlType::NVarChar:
    case mssql::DatumStorage::SqlType::NText:
    case mssql::DatumStorage::SqlType::Char:
    case mssql::DatumStorage::SqlType::VarChar:
    case mssql::DatumStorage::SqlType::Text:
      handled = handleStringTypes(env, jsWriter, column, colType);
      break;

    // Numeric types
    case mssql::DatumStorage::SqlType::TinyInt:
      handled = handleTinyInt(env, jsWriter, column);
      break;

    case mssql::DatumStorage::SqlType::SmallInt:
      handled = handleSmallInt(env, jsWriter, column);
      break;

    case mssql::DatumStorage::SqlType::Integer:
      handled = handleInteger(env, jsWriter, column);
      break;

    case mssql::DatumStorage::SqlType::BigInt:
      handled = handleBigInt(env, jsWriter, column);
      break;

    case mssql::DatumStorage::SqlType::Double:
    case mssql::DatumStorage::SqlType::Float:
    case mssql::DatumStorage::SqlType::Real:
      handled = handleFloatingPoint(env, jsWriter, column);
      break;

    case mssql::DatumStorage::SqlType::Bit:
      handled = handleBit(env, jsWriter, column);
      break;

    // Date/Time types
    case mssql::DatumStorage::SqlType::Date:
    case mssql::DatumStorage::SqlType::Time:
    case mssql::DatumStorage::SqlType::DateTime:
    case mssql::DatumStorage::SqlType::DateTime2:
    case mssql::DatumStorage::SqlType::DateTimeOffset:
      handled = handleDateTimeTypes(env, jsWriter, column, colType);
      break;

    // Binary types
    case mssql::DatumStorage::SqlType::Binary:
    case mssql::DatumStorage::SqlType::VarBinary:
      handled = handleBinaryTypes(env, jsWriter, column);
      break;

    // Variant type
    case mssql::DatumStorage::SqlType::Variant:
      handled = handleVariantType(env, jsWriter, column);
      break;

    // Unknown/default type
    default:
      handled = handleUnknownType(env, jsWriter, column);
      break;
  }
  return handled;
}

Napi::Array JsObjectMapper::fromOdbcRowAsArray(const Napi::Env& env,
                                               const std::shared_ptr<IOdbcRow>& row,
                                               const QueryResult& columnDefs) {
  const auto columnCount = row->columnCount();
  Napi::Array jsArray = Napi::Array::New(env, columnCount);

  // Iterate through each column in the row
  for (size_t colIdx = 0; colIdx < columnCount; ++colIdx) {
    const auto& column = row->getColumn(colIdx);
    const auto& colDef = columnDefs.get(colIdx);

    // Check for NULL
    if (column.isNull()) {
      jsArray[colIdx] = env.Null();
      continue;
    }
    JsArrayTarget jsArrayTarget(jsArray, colIdx);
    bool handled = handleColumn(env, jsArrayTarget, column, colDef);

    // If the handler didn't handle the type, set NULL as fallback
    if (!handled) {
      jsArray[colIdx] = env.Null();
    }
  }

  return jsArray;
}

// Main method to convert ODBC row to JavaScript object
Napi::Object JsObjectMapper::fromOdbcRow(const Napi::Env& env,
                                         const std::shared_ptr<IOdbcRow>& row,
                                         const QueryResult& columnDefs) {
  Napi::Object jsWriter = Napi::Object::New(env);
  const auto columnCount = row->columnCount();

  // Iterate through each column in the row
  for (size_t colIdx = 0; colIdx < columnCount; ++colIdx) {
    const auto& column = row->getColumn(colIdx);
    const auto& colDef = columnDefs.get(colIdx);
    const auto colName = StringUtils::WideToUtf8(colDef.name.data(), colDef.colNameLen);
    JsObjectTarget jsWriterTarget(jsWriter, colName);
    // Check for NULL
    if (column.isNull()) {
      handleNullValue(env, jsWriterTarget);
      continue;
    }

    // Dispatch to appropriate handler
    bool handled = handleColumn(env, jsWriterTarget, column, colDef);

    // If the handler didn't handle the type, set NULL as fallback
    if (!handled) {
      handleNullValue(env, jsWriterTarget);
    }
  }

  return jsWriter;
}
}  // namespace mssql