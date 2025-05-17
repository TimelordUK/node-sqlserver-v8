// In js_object_mapper.h
#pragma once
#include <napi.h>

#include <core/datum_storage.h>      // Include for DatumStorage::SqlType
#include <odbc/odbc_driver_types.h>  // Include your C++ type definitions
#include <odbc/odbc_error.h>
namespace mssql {

class IOdbcRow;
class JsObjectMapper {
 public:
  // Main mapping methods
  static ProcedureParamMeta toProcedureParamMeta(const Napi::Object& jsObject);
  static NativeParam toNativeParam(const Napi::Object& jsObject);
  static StatementHandle toStatementHandle(const Napi::Object& jsObject);
  // static UserDefinedType toUserDefinedType(const Napi::Object &jsObject);
  // static DatabaseConnection toDatabaseConnection(const Napi::Object &jsObject);

  // New methods for working with QueryResult and ColumnDefinition
  static Napi::Object fromColumnDefinition(const Napi::Env& env, const ColumnDefinition& colDef);
  static Napi::Array fromQueryResult(const Napi::Env& env, const QueryResult& result);
  static Napi::Object fromStatementHandle(const Napi::Env& env, StatementHandle handle);
  static Napi::Object fromOdbcError(const Napi::Env& env, const OdbcError& error);
  // Reverse mapping (C++ to JS)
  static Napi::Object fromProcedureParamMeta(const Napi::Env& env, const ProcedureParamMeta& param);
  static Napi::Object fromNativeParam(const Napi::Env& env, const NativeParam& param);
  static Napi::Object fromNativeQueryResult(const Napi::Env& env,
                                            const std::shared_ptr<QueryResult> queryResult);

  static SqlParamValue safeGetValue(const Napi::Object& obj, const std::string& prop);
  static Napi::Value fromSqlParamValue(const Napi::Env& env, const SqlParamValue& value);

  // New method to convert an OdbcRow to a JavaScript object

  static Napi::Object fromOdbcRow(const Napi::Env& env,
                                  const std::shared_ptr<IOdbcRow>& row,
                                  const QueryResult& columnDefs);

 private:
  // Helper methods to reduce boilerplate
  static std::string safeGetString(const Napi::Object& obj,
                                   const std::string& prop,
                                   const std::string& defaultVal = "");
  static int64_t safeGetInt64(const Napi::Object& obj,
                              const std::string& prop,
                              int64_t defaultVal = 0);
  static int32_t safeGetInt32(const Napi::Object& obj,
                              const std::string& prop,
                              int32_t defaultVal = 0);
  static bool safeGetBool(const Napi::Object& obj,
                          const std::string& prop,
                          bool defaultVal = false);

  static bool handleColumn(const Napi::Env& env,
                           Napi::Object& jsRow,
                           const DatumStorage& column,
                           const std::string& colName,
                           const ColumnDefinition& colDef);

  // Helper methods for handling different data types in fromOdbcRow
  static void handleNullValue(const Napi::Env& env,
                              Napi::Object& jsRow,
                              const std::string& colName);

  // String types
  static bool handleStringTypes(const Napi::Env& env,
                                Napi::Object& jsRow,
                                const std::string& colName,
                                const DatumStorage& column,
                                DatumStorage::SqlType colType);

  // Numeric types
  static bool handleTinyInt(const Napi::Env& env,
                            Napi::Object& jsRow,
                            const std::string& colName,
                            const DatumStorage& column);
  static bool handleSmallInt(const Napi::Env& env,
                             Napi::Object& jsRow,
                             const std::string& colName,
                             const DatumStorage& column);
  static bool handleInteger(const Napi::Env& env,
                            Napi::Object& jsRow,
                            const std::string& colName,
                            const DatumStorage& column);
  static bool handleBigInt(const Napi::Env& env,
                           Napi::Object& jsRow,
                           const std::string& colName,
                           const DatumStorage& column);
  static bool handleFloatingPoint(const Napi::Env& env,
                                  Napi::Object& jsRow,
                                  const std::string& colName,
                                  const DatumStorage& column);
  static bool handleBit(const Napi::Env& env,
                        Napi::Object& jsRow,
                        const std::string& colName,
                        const DatumStorage& column);

  // Date/Time types
  static bool handleDateTimeTypes(const Napi::Env& env,
                                  Napi::Object& jsRow,
                                  const std::string& colName,
                                  const DatumStorage& column,
                                  DatumStorage::SqlType colType);

  // Binary types
  static bool handleBinaryTypes(const Napi::Env& env,
                                Napi::Object& jsRow,
                                const std::string& colName,
                                const DatumStorage& column);

  // Variant type
  static bool handleVariantType(const Napi::Env& env,
                                Napi::Object& jsRow,
                                const std::string& colName,
                                const DatumStorage& column);

  // Fallback for unknown types
  static bool handleUnknownType(const Napi::Env& env,
                                Napi::Object& jsRow,
                                const std::string& colName,
                                const DatumStorage& column);
};
}  // namespace mssql