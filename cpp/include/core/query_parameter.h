// In query_parameter.h
#pragma once

#include <memory>
#include <vector>
#include <string>
#include <sql.h>
#include <sqlext.h>
#include <core/datum_storage.h>

namespace mssql {
class IOdbcApi;
/**
 * @brief Represents a parameter value that can be bound to an ODBC statement.
 * The actual parameter data is stored in DatumStorage and binding to ODBC is handled here.
 */
class QueryParameter {
 public:
  explicit QueryParameter(int index, std::shared_ptr<DatumStorage> storage);

  /**
   * @brief Bind this parameter to an ODBC statement
   * @param hstmt ODBC statement handle
   * @return SQL_SUCCESS if binding was successful, error code otherwise
   */
  SQLRETURN bind(SQLHSTMT hstmt, std::shared_ptr<IOdbcApi> api);

  /**
   * @brief Get the parameter index (1-based as per ODBC)
   */
  int getIndex() const {
    return index_;
  }

  /**
   * @brief Get the parameter size in bytes
   */
  SQLULEN getParamSize() const {
    return param_size_;
  }

  /**
   * @brief Get the parameter direction
   */
  SQLSMALLINT getParamType() const {
    return param_type_;
  }

  /**
   * @brief Check if this is an output parameter
   */
  bool isOutput() const {
    return param_type_ == SQL_PARAM_OUTPUT || param_type_ == SQL_PARAM_INPUT_OUTPUT;
  }

  /**
   * @brief Get the parameter name
   */
  const std::string& getName() const {
    return name_;
  }

  /**
   * @brief Get the underlying storage
   */
  std::shared_ptr<DatumStorage> getStorage() const {
    return storage_;
  }

 private:
  int index_;                       // Parameter index (1-based)
  std::string name_;                // Parameter name (optional)
  SQLSMALLINT param_type_;          // Parameter type (input/output)
  SQLULEN param_size_;              // Column size
  SQLSMALLINT decimal_digits_;      // Decimal digits for numeric types
  std::vector<SQLLEN> indicators_;  // Indicator values

  SQLSMALLINT c_type;
  SQLSMALLINT sql_type;
  
  /**
   * @brief Map DatumStorage SQL type to ODBC C and SQL type constants
   */
  void mapStorageTypeToOdbc();
  
  /**
   * @brief Infer the SQL type from the actual storage data when type is Unknown
   */
  DatumStorage::SqlType inferTypeFromStorage();
  SQLULEN param_size;
  SQLULEN max_length;
  SQLSMALLINT digits;
  SQLPOINTER buffer;
  SQLLEN buffer_len;
  int32_t offset;
  bool is_bcp;
  int32_t bcp_version;
  uint32_t ordinal_position;
  SQLULEN bcp_terminator_len;
  LPCBYTE bcp_terminator;

  bool is_tvp;
  bool is_money;
  int tvp_no_cols;

  // The actual parameter data storage
  std::shared_ptr<DatumStorage> storage_;
};
}  // namespace mssql