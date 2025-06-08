// In js_object_mapper.h
#pragma once
#include <napi.h>

#include <core/datum_storage.h>      // Include for DatumStorage::SqlType
#include <odbc/odbc_driver_types.h>  // Include your C++ type definitions
#include <odbc/odbc_error.h>
namespace mssql {

class IOdbcRow;
class QueryOperationParams;
class ResultSet;
// Create a utility class for different target containers

class JsValueTarget {
 public:
  virtual void setValue(const Napi::Env& env, const Napi::Value& value) = 0;
  virtual void setNull(const Napi::Env& env) = 0;
  virtual ~JsValueTarget() = default;
  virtual std::string description() const = 0;
};

// Implementation for Object targets
class JsObjectTarget : public JsValueTarget {
 private:
  Napi::Object& obj;
  std::string propertyName;

 public:
  JsObjectTarget(Napi::Object& obj, const std::string& propertyName)
      : obj(obj), propertyName(propertyName) {}

  void setValue(const Napi::Env& env, const Napi::Value& value) override {
    obj.Set(propertyName, value);
  }

  void setNull(const Napi::Env& env) override {
    obj.Set(propertyName, env.Null());
  }

  std::string description() const override {
    return "JsObjectTarget: " + propertyName;
  }
};

// Implementation for Array targets
class JsArrayTarget : public JsValueTarget {
 private:
  Napi::Array& arr;
  size_t index;

 public:
  JsArrayTarget(Napi::Array& arr, size_t index) : arr(arr), index(index) {}

  void setValue(const Napi::Env& env, const Napi::Value& value) override {
    arr[index] = value;
  }

  void setNull(const Napi::Env& env) override {
    arr[index] = env.Null();
  }

  std::string description() const override {
    return "JsArrayTarget: " + std::to_string(index);
  }
};

class JsObjectMapper {
 public:
  // Main mapping methods
  static ProcedureParamMeta toProcedureParamMeta(const Napi::Object& jsObject);
  static QueryOptions toQueryOptions(const Napi::Object& jsObject);
  static std::shared_ptr<SqlParameter> toSqlParameter(const Napi::Object& jsObject);
  static StatementHandle toStatementHandle(const Napi::Object& jsObject);
  static NativeParam toNativeParam(const Napi::Object& jsObject);
  static std::shared_ptr<QueryOperationParams> toQueryOperationParams(const Napi::Object& jsObject);
  static Napi::Object fromColumnDefinition(const Napi::Env& env, const ColumnDefinition& colDef);
  static Napi::Array fromQueryResult(const Napi::Env& env, const QueryResult& result);
  static Napi::Object fromStatementHandle(const Napi::Env& env, StatementHandle handle);
  static Napi::Error fromOdbcError(const Napi::Env& env, const OdbcError& error);
  // Reverse mapping (C++ to JS)
  static Napi::Object fromStatementStateChange(const Napi::Env& env,
                                               const StatementStateChange& stateChange);
  static Napi::Object fromProcedureParamMeta(const Napi::Env& env, const ProcedureParamMeta& param);
  static Napi::Object fromSqlParameter(const Napi::Env& env, const SqlParameter& param);
  static Napi::Object fromNativeQueryResult(const Napi::Env& env,
                                            const std::shared_ptr<QueryResult> queryResult);

  // New method to convert an OdbcRow to a JavaScript object
  static Napi::Array fromOdbcRowAsArray(const Napi::Env& env,
                                        const std::shared_ptr<IOdbcRow>& row,
                                        const QueryResult& columnDefs);
  static Napi::Object fromOdbcRow(const Napi::Env& env,
                                  const std::shared_ptr<IOdbcRow>& row,
                                  const QueryResult& columnDefs);

  static std::u16string safeGetWideString(const Napi::Object& obj,
                                          const std::string& prop,
                                          const std::u16string& defaultVal = u"");
  // Helper methods to reduce boilerplate
  static std::string safeGetString(const Napi::Object& obj,
                                   const std::string& prop,
                                   const std::string& defaultVal = "");
  static int64_t safeGetInt64(const Napi::Object& obj,
                              const std::string& prop,
                              int64_t defaultVal = 0);
  static int64_t safeGetInt64(const Napi::Object& obj, int64_t defaultVal = 0);
  static int32_t safeGetInt32(const Napi::Object& obj, int32_t defaultVal = 0);
  static int32_t safeGetInt32(const Napi::Object& obj,
                              const std::string& prop,
                              int32_t defaultVal = 0);
  static bool safeGetBool(const Napi::Object& obj,
                          const std::string& prop,
                          bool defaultVal = false);
  static Napi::Object fromQueryResult(const Napi::Env&, const std::shared_ptr<ResultSet>& result);

 private:
  static bool handleColumn(const Napi::Env& env,
                           JsValueTarget& jsWriter,
                           const DatumStorage& column,
                           const ColumnDefinition& colDef);

  // Helper methods for handling different data types in fromOdbcRow
  static void handleNullValue(const Napi::Env& env, JsValueTarget& jsWriter);

  // String types
  static bool handleStringTypes(const Napi::Env& env,
                                JsValueTarget& jsWriter,
                                const DatumStorage& column,
                                DatumStorage::SqlType colType);

  // Numeric types
  static bool handleTinyInt(const Napi::Env& env,
                            JsValueTarget& jsWriter,
                            const DatumStorage& column);
  static bool handleSmallInt(const Napi::Env& env,
                             JsValueTarget& jsWriter,
                             const DatumStorage& column);
  static bool handleInteger(const Napi::Env& env,
                            JsValueTarget& jsWriter,
                            const DatumStorage& column);
  static bool handleBigInt(const Napi::Env& env,
                           JsValueTarget& jsWriter,
                           const DatumStorage& column);
  static bool handleFloatingPoint(const Napi::Env& env,
                                  JsValueTarget& jsWriter,
                                  const DatumStorage& column);
  static bool handleBit(const Napi::Env& env, JsValueTarget& jsWriter, const DatumStorage& column);

  // Date/Time types
  static bool handleDateTimeTypes(const Napi::Env& env,
                                  JsValueTarget& jsWriter,
                                  const DatumStorage& column,
                                  DatumStorage::SqlType colType);

  // Binary types
  static bool handleBinaryTypes(const Napi::Env& env,
                                JsValueTarget& jsWriter,
                                const DatumStorage& column);

  // Variant type
  static bool handleVariantType(const Napi::Env& env,
                                JsValueTarget& jsWriter,
                                const DatumStorage& column);

  // Fallback for unknown types
  static bool handleUnknownType(const Napi::Env& env,
                                JsValueTarget& jsWriter,
                                const DatumStorage& column);

  static void decodeIntoStorage(const Napi::Object& jsObject, SqlParameter& param);
};
}  // namespace mssql