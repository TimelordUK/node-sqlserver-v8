#include <platform.h>
#include <odbc/odbc_statement.h>
#include <odbc/odbc_state_notifier.h>

#include <cstring>  // For std::memcpy

#include <common/odbc_common.h>

#include <common/string_utils.h>
#include <core/bound_datum_set.h>
#include <odbc/iodbc_api.h>
#include <odbc/odbc_driver_types.h>
#include <odbc/odbc_error_handler.h>
#include <odbc/odbc_row.h>
#include <odbc/odbc_type_mapper.h>
#include <utils/Logger.h>

const int SQL_SERVER_MAX_STRING_SIZE = 8000;

// default size to retrieve from a LOB field and we don't know the size
// const int LOB_PACKET_SIZE = 8192;  // Currently unused

namespace mssql {
enum class ExecutionState { Initial, Prepared, Executed, Completed, Error };

void OdbcStatement::SetStateNotifier(std::shared_ptr<IOdbcStateNotifier> notifier) {
  stateNotifierShared_ = notifier;  // Keep the shared_ptr alive
  if (notifier) {
    stateNotifier_ = std::make_unique<WeakStateNotifier>(notifier);
  } else {
    stateNotifier_.reset();
  }
}

void OdbcStatement::SetState(State newState) {
  // Use atomic exchange to get old state and set new state atomically
  State oldState = state_.exchange(newState);

  // Only notify if state actually changed
  if (oldState != newState && stateNotifier_) {
    stateNotifier_->NotifyStateChange(handle_, oldState, newState);
  }
}

bool OdbcStatement::ReadNextResult(std::shared_ptr<QueryResult> result) {
  SQL_LOG_TRACE_STREAM("ReadNextResult: " << result->toString());
  return true;
}

// Implementation of TryReadRows from the Interface
bool OdbcStatement::TryReadRows(std::shared_ptr<QueryResult> result, const size_t number_rows) {
  if (number_rows == 0) {
    return false;
  }
  SQL_LOG_TRACE_STREAM("TryReadRows: number_rows " << number_rows);
  rows_.clear();
  rows_.reserve(number_rows);
  return fetch_read(result, number_rows);
}

// Legacy method for backward compatibility
bool OdbcStatement::try_read_rows(std::shared_ptr<QueryResult> result, const size_t number_rows) {
  // Just delegate to the new method
  return TryReadRows(result, number_rows);
}

bool OdbcStatement::check_odbc_error(const SQLRETURN ret) {
  statement_->read_errors(odbcApi_, errors_);
  if (errors_->size() > 0) {
    SQL_LOG_TRACE_STREAM("check_odbc_error: error in statement " << errors_->size());
    for (const auto& error : *errors_) {
      SQL_LOG_ERROR_STREAM("check_odbc_error: " << error->message);
    }
    return false;
  }

  return true;
}

bool OdbcStatement::fetch_read(std::shared_ptr<QueryResult> result, const size_t number_rows) {
  SQL_LOG_TRACE_STREAM("fetch_read: number_rows " << number_rows);
  auto res = false;
  for (size_t row_id = 0; row_id < number_rows; ++row_id) {
    const auto ret = odbcApi_->SQLFetch(statement_->get_handle());
    if (ret == SQL_NO_DATA) {
      // fprintf(stderr, "fetch_read SQL_NO_DATA\n");
      result->set_end_of_rows(true);
      return true;
    }
    if (!check_odbc_error(ret)) {
      SQL_LOG_TRACE_STREAM("fetch_read: error in  SQLFetch" << number_rows);
      return false;
    }
    result->set_end_of_rows(false);
    res = true;
    const auto column_count = static_cast<int>(metaData_->get_column_count());
    SQL_LOG_TRACE_STREAM("fetch_read: column_count " << column_count);
    std::shared_ptr<IOdbcRow> row = std::make_shared<OdbcRow>(*metaData_);
    rows_.push_back(row);
    for (auto c = 0; c < column_count; ++c) {
      const auto& definition = metaData_->get(c);
      // Use the actual index of the row we just added, not the loop index
      res = dispatch(definition.dataType, rows_.size() - 1, c);
      if (!res) {
        SQL_LOG_DEBUG_STREAM("terminating early : fetch_read column " << c);
        break;
      }
    }
  }
  return res;
}

struct lob_capture_ {
  lob_capture_(mssql::DatumStorage& storage)
      : reads(1),
        n_items(0),
        maxvarchar(false),
        item_size(sizeof(uint16_t)),
        src_data{},
        write_ptr{},
        atomic_read_bytes(24 * 1024),
        bytes_to_read(atomic_read_bytes),
        storage(storage),
        total_bytes_to_read(atomic_read_bytes) {
    storage.reserve(atomic_read_bytes / item_size + 1);
    src_data = storage.getTypedVector<uint16_t>();
    write_ptr = src_data->data();
  }

  void trim() const {
    if (maxvarchar) {
      auto last = src_data->size() - 1;
      while ((*src_data)[last] == 0) {
        --last;
      }
      if (last < src_data->size() - 1) {
        src_data->resize(last + 1);
      }
    }
  }

  void on_next_read() {
    ++reads;
    if (total_bytes_to_read < 0) {
      const auto previous = src_data->size();
      total_bytes_to_read = bytes_to_read * (reads + 1);
      n_items = total_bytes_to_read / item_size;
      src_data->reserve(n_items + 1);
      src_data->resize(n_items);
      write_ptr = src_data->data() + previous;
      memset(write_ptr, 0, src_data->data() + src_data->size() - write_ptr);
    } else {
      write_ptr += bytes_to_read / item_size;
    }
  }

  void on_first_read(const int factor = 2) {
    maxvarchar = total_bytes_to_read < 0;
    if (maxvarchar) {
      total_bytes_to_read = bytes_to_read * factor;
    }
    n_items = total_bytes_to_read / item_size;
    src_data->reserve(n_items + 1);
    src_data->resize(n_items);

    if (total_bytes_to_read > bytes_to_read) {
      total_bytes_to_read -= bytes_to_read;
    }
    write_ptr = src_data->data();
    write_ptr += bytes_to_read / item_size;
  }

  SQLLEN reads;
  size_t n_items;
  bool maxvarchar;
  const size_t item_size;
  std::shared_ptr<std::vector<uint16_t>> src_data;
  unsigned short* write_ptr;
  const SQLLEN atomic_read_bytes;
  SQLLEN bytes_to_read;
  DatumStorage& storage;
  SQLLEN total_bytes_to_read;
};

bool OdbcStatement::lob_wchar(const size_t row_id, size_t column) {
  // cerr << "lob ..... " << endl;
  const auto& statement = statement_->get_handle();
  auto row = rows_[row_id];
  auto& column_data = row->getColumn(column);
  lob_capture_ capture(column_data);

  // Mark this as a Unicode/wide string type for consistent handling in JS
  column_data.setType(DatumStorage::SqlType::NVarChar);

  SQL_LOG_TRACE_STREAM("lob_wchar: calling SQLGetData for row_id " << row_id << " column "
                                                                   << column);
  auto r = odbcApi_->SQLGetData(statement,
                                static_cast<SQLUSMALLINT>(column + 1),
                                SQL_C_WCHAR,
                                capture.write_ptr,
                                capture.bytes_to_read + capture.item_size,
                                &capture.total_bytes_to_read);

  if (capture.total_bytes_to_read == SQL_NULL_DATA) {
    column_data.setNull();
    return true;
  }
  if (!check_odbc_error(r)) {
    column_data.setNull();
    return false;
  }
  auto status = false;
  auto more = check_more_read(r, status);
  if (!status) {
    SQL_LOG_TRACE_STREAM("lob_wchar check_more_read " << status);
    // cerr << "lob check_more_read " << endl;
    return false;
  }
  capture.on_first_read();
  while (more) {
    capture.bytes_to_read = std::min(capture.atomic_read_bytes, capture.total_bytes_to_read);

    SQL_LOG_TRACE_STREAM("lob_wchar: calling SQLGetData for additional data");
    r = odbcApi_->SQLGetData(statement,
                             static_cast<SQLUSMALLINT>(column + 1),
                             SQL_C_WCHAR,
                             capture.write_ptr,
                             capture.bytes_to_read + capture.item_size,
                             &capture.total_bytes_to_read);

    capture.on_next_read();
    if (!check_odbc_error(r)) {
      SQL_LOG_TRACE_STREAM("lob_wchar error " << r);
      return false;
    }
    more = check_more_read(r, status);
    if (!status) {
      SQL_LOG_TRACE_STREAM("lob_wchar status " << status);
      return false;
    }
  }
  capture.trim();
  column_data.setNull(false);
  return true;
}

// Structure for handling single-byte character LOBs
struct lob_char_capture {
  lob_char_capture(mssql::DatumStorage& storage)
      : reads(1),
        n_items(0),
        maxvarchar(false),
        item_size(sizeof(char)),
        src_data{},
        write_ptr{},
        atomic_read_bytes(24 * 1024),
        bytes_to_read(atomic_read_bytes),
        storage(storage),
        total_bytes_to_read(atomic_read_bytes) {
    storage.reserve(atomic_read_bytes / item_size + 1);
    src_data = storage.getTypedVector<char>();
    write_ptr = src_data->data();
  }

  void trim() const {
    if (maxvarchar) {
      auto last = src_data->size() - 1;
      while (last > 0 && (*src_data)[last] == 0) {
        --last;
      }
      if (last < src_data->size() - 1) {
        src_data->resize(last + 1);
      }
    }
  }

  void on_next_read() {
    ++reads;
    if (total_bytes_to_read < 0) {
      const auto previous = src_data->size();
      total_bytes_to_read = bytes_to_read * (reads + 1);
      n_items = total_bytes_to_read / item_size;
      src_data->reserve(n_items + 1);
      src_data->resize(n_items);
      write_ptr = src_data->data() + previous;
      memset(write_ptr, 0, src_data->data() + src_data->size() - write_ptr);
    } else {
      write_ptr += bytes_to_read / item_size;
    }
  }

  void on_first_read(const int factor = 2) {
    maxvarchar = total_bytes_to_read < 0;
    if (maxvarchar) {
      total_bytes_to_read = bytes_to_read * factor;
    }
    n_items = total_bytes_to_read / item_size;
    src_data->reserve(n_items + 1);
    src_data->resize(n_items);

    if (total_bytes_to_read > bytes_to_read) {
      total_bytes_to_read -= bytes_to_read;
    }
    write_ptr = src_data->data();
    write_ptr += bytes_to_read / item_size;
  }

  SQLLEN reads;
  size_t n_items;
  bool maxvarchar;
  const size_t item_size;
  std::shared_ptr<std::vector<char>> src_data;
  char* write_ptr;
  const SQLLEN atomic_read_bytes;
  SQLLEN bytes_to_read;
  DatumStorage& storage;
  SQLLEN total_bytes_to_read;
};

bool OdbcStatement::lob_char(const size_t row_id, size_t column) {
  const auto& statement = statement_->get_handle();
  auto row = rows_[row_id];
  auto& column_data = row->getColumn(column);

  // Mark this as a varchar type for consistent handling in JS
  column_data.setType(DatumStorage::SqlType::VarChar);

  lob_char_capture capture(column_data);

  SQL_LOG_TRACE_STREAM("lob_char: calling SQLGetData for row_id " << row_id << " column "
                                                                  << column);
  auto r = odbcApi_->SQLGetData(statement,
                                static_cast<SQLUSMALLINT>(column + 1),
                                SQL_C_CHAR,
                                capture.write_ptr,
                                capture.bytes_to_read + capture.item_size,
                                &capture.total_bytes_to_read);

  if (capture.total_bytes_to_read == SQL_NULL_DATA) {
    column_data.setNull();
    return true;
  }
  if (!check_odbc_error(r)) {
    column_data.setNull();
    return false;
  }
  auto status = false;
  auto more = check_more_read(r, status);
  if (!status) {
    SQL_LOG_TRACE_STREAM("lob_char check_more_read " << status);
    return false;
  }
  capture.on_first_read();
  while (more) {
    capture.bytes_to_read = std::min(capture.atomic_read_bytes, capture.total_bytes_to_read);

    SQL_LOG_TRACE_STREAM("lob_char: calling SQLGetData for additional data");
    r = odbcApi_->SQLGetData(statement,
                             static_cast<SQLUSMALLINT>(column + 1),
                             SQL_C_CHAR,
                             capture.write_ptr,
                             capture.bytes_to_read + capture.item_size,
                             &capture.total_bytes_to_read);

    capture.on_next_read();
    if (!check_odbc_error(r)) {
      SQL_LOG_TRACE_STREAM("lob_char error " << r);
      return false;
    }
    more = check_more_read(r, status);
    if (!status) {
      SQL_LOG_TRACE_STREAM("lob_char status " << status);
      return false;
    }
  }
  capture.trim();
  column_data.setNull(false);
  return true;
}

bool OdbcStatement::check_more_read(SQLRETURN r, bool& status) {
  const auto& statement = statement_->get_handle();
  std::vector<SQLWCHAR> sql_state(6);
  SQLINTEGER native_error = 0;
  SQLSMALLINT text_length = 0;
  auto res = false;
  if (r == SQL_SUCCESS_WITH_INFO) {
    SQL_LOG_TRACE_STREAM("check_more_read: calling SQLGetDiagRec");
    r = odbcApi_->SQLGetDiagRecW(
        SQL_HANDLE_STMT, statement, 1, sql_state.data(), &native_error, nullptr, 0, &text_length);

    if (!check_odbc_error(r)) {
      status = false;
      return false;
    }
    const auto state = mssql::StringUtils::WideToUtf8(sql_state.data(), sql_state.size());
    SQL_LOG_DEBUG_STREAM("check_more_read " << state);
    res = state == "01004";
  }
  status = true;
  return res;
}

bool OdbcStatement::dispatch(const SQLSMALLINT t, const size_t row_id, const size_t column) {
  if (!statement_) {
    return false;
  }

  const auto handle = statement_->get_handle();
  if (!handle) {
    return false;
  }
  SQL_LOG_TRACE_STREAM("dispatch: t " << t << " row_id " << row_id << " column " << column);
  auto row = rows_[row_id];

  // Reference column but don't use directly to silence compiler warning
  // The called methods will access it through the row
  row->getColumn(column);

  // cerr << " dispatch row = " << row_id << endl;
  bool res;

  switch (t) {
    case SQL_SS_VARIANT:
      res = d_variant(row_id, column);
      break;

    case SQL_CHAR:
    case SQL_VARCHAR:
    case SQL_LONGVARCHAR:
    case SQL_WCHAR:
    case SQL_WVARCHAR:
    case SQL_WLONGVARCHAR:
    case SQL_SS_XML:
    case SQL_GUID:
      res = try_read_string(false, row_id, column);
      break;

    case SQL_BIT:
      res = get_data_bit(row_id, column);
      break;

    case SQL_TINYINT:
    case SQL_C_STINYINT:
    case SQL_C_UTINYINT:
      if (IsNumericStringEnabled()) {
        res = try_read_string(false, row_id, column);
      } else {
        res = get_data_tiny(row_id, column);
      }
      break;

    case SQL_SMALLINT:
    case SQL_C_USHORT:
      if (IsNumericStringEnabled()) {
        res = try_read_string(false, row_id, column);
      } else {
        res = get_data_small_int(row_id, column);
      }
      break;

    case SQL_INTEGER:
      if (IsNumericStringEnabled()) {
        res = try_read_string(false, row_id, column);
      } else {
        // Log the exact SQL type for debugging
        SQL_LOG_DEBUG_STREAM("dispatch: Processing integer type: " << t);
        res = get_data_int(row_id, column);
      }

      break;

    case SQL_C_SLONG:
    case SQL_C_ULONG:
      if (IsNumericStringEnabled()) {
        res = try_read_string(false, row_id, column);
      } else {
        // Log the exact SQL type for debugging
        SQL_LOG_DEBUG_STREAM("dispatch: Processing long type: " << t);
        res = get_data_long(row_id, column);
      }
      break;

    case SQL_C_SBIGINT:
    case SQL_C_UBIGINT:
    case SQL_BIGINT:
      if (IsNumericStringEnabled()) {
        res = try_read_string(false, row_id, column);
      } else {
        res = get_data_big_int(row_id, column);
      }
      break;

    case SQL_NUMERIC:
      if (IsNumericStringEnabled()) {
        res = try_read_string(false, row_id, column);
      } else {
        res = get_data_decimal(row_id, column);
      }
      break;

    case SQL_DECIMAL:
    case SQL_REAL:
    case SQL_FLOAT:
    case SQL_DOUBLE:
      res = get_data_decimal(row_id, column);
      break;

    case SQL_BINARY:
    case SQL_VARBINARY:
    case SQL_LONGVARBINARY:
    case SQL_SS_UDT:
      res = get_data_binary(row_id, column);
      break;

    case SQL_SS_TIMESTAMPOFFSET:
      res = get_data_timestamp_offset(row_id, column);
      break;

    case SQL_TYPE_TIME:
    case SQL_SS_TIME2:
      res = d_time(row_id, column);
      break;

    case SQL_TIMESTAMP:
    case SQL_DATETIME:
    case SQL_TYPE_TIMESTAMP:
    case SQL_TYPE_DATE:
      res = get_data_timestamp(row_id, column);
      break;

    default:
      res = try_read_string(false, row_id, column);
      break;
  }

  return res;
}

bool OdbcStatement::get_data_tiny(const size_t row_id, const size_t column) {
  SQL_LOG_TRACE_STREAM("get_data_tiny: row_id " << row_id << " column " << column);
  const auto& statement = statement_->get_handle();
  long v = 0;
  SQLLEN str_len_or_ind_ptr = 0;
  const auto row = rows_[row_id];
  auto& column_data = row->getColumn(column);

  SQL_LOG_TRACE_STREAM("get_data_tiny: calling SQLGetData");
  const auto ret = odbcApi_->SQLGetData(statement,
                                        static_cast<SQLUSMALLINT>(column + 1),
                                        SQL_C_SLONG,
                                        &v,
                                        sizeof(long),
                                        &str_len_or_ind_ptr);
  if (!check_odbc_error(ret)) {
    column_data.setNull();
    return false;
  }

  if (str_len_or_ind_ptr == SQL_NULL_DATA) {
    column_data.setNull();
    return true;
  }

  column_data.setType(DatumStorage::SqlType::TinyInt);
  const int8_t v8 = static_cast<int8_t>(v);
  column_data.addValue(v8);

  return true;
}

bool OdbcStatement::get_data_small_int(const size_t row_id, const size_t column) {
  SQL_LOG_TRACE_STREAM("get_data_small_int: row_id " << row_id << " column " << column);
  const auto& statement = statement_->get_handle();
  int16_t v = 0;
  SQLLEN str_len_or_ind_ptr = 0;
  const auto row = rows_[row_id];
  auto& column_data = row->getColumn(column);

  SQL_LOG_TRACE_STREAM("get_data_small_int: calling SQLGetData");
  const auto ret = odbcApi_->SQLGetData(statement,
                                        static_cast<SQLUSMALLINT>(column + 1),
                                        SQL_C_SHORT,
                                        &v,
                                        sizeof(int16_t),
                                        &str_len_or_ind_ptr);
  if (!check_odbc_error(ret)) {
    column_data.setNull();
    return false;
  }

  if (str_len_or_ind_ptr == SQL_NULL_DATA) {
    column_data.setNull();
    return true;
  }

  auto datumType = DatumStorage::SqlType::SmallInt;
  column_data.setType(datumType);
  column_data.addValue(v);

  return true;
}

bool OdbcStatement::get_data_int(const size_t row_id, const size_t column) {
  SQL_LOG_TRACE_STREAM("get_data_int: row_id " << row_id << " column " << column);
  const auto& statement = statement_->get_handle();
  int32_t v = 0;
  SQLLEN str_len_or_ind_ptr = 0;
  const auto row = rows_[row_id];
  auto& column_data = row->getColumn(column);

  // Get the original column definition to determine the correct SQL type
  const auto& colDef = metaData_->get(static_cast<int>(column));
  const SQLSMALLINT originalSqlType = colDef.dataType;

  SQL_LOG_DEBUG_STREAM("get_data_int: originalSqlType SQL type: " << originalSqlType);

  SQL_LOG_TRACE_STREAM("get_data_int: calling SQLGetData");
  const auto ret = odbcApi_->SQLGetData(statement,
                                        static_cast<SQLUSMALLINT>(column + 1),
                                        SQL_INTEGER,
                                        &v,
                                        sizeof(int32_t),
                                        &str_len_or_ind_ptr);
  if (!check_odbc_error(ret)) {
    column_data.setNull();
    return false;
  }

  if (str_len_or_ind_ptr == SQL_NULL_DATA) {
    column_data.setNull();
    return true;
  }

  auto datumType = DatumStorage::SqlType::Integer;
  column_data.setType(datumType);
  column_data.addValue(static_cast<int32_t>(v));

  SQL_LOG_DEBUG_STREAM(
      "get_data_int: Mapped to DatumStorage type: " << static_cast<int>(datumType));

  return true;
}

bool OdbcStatement::get_data_long(const size_t row_id, const size_t column) {
  SQL_LOG_TRACE_STREAM("get_data_long: row_id " << row_id << " column " << column);
  const auto& statement = statement_->get_handle();
  int32_t v = 0;
  SQLLEN str_len_or_ind_ptr = 0;
  const auto row = rows_[row_id];
  auto& column_data = row->getColumn(column);

  // Get the original column definition to determine the correct SQL type
  const auto& colDef = metaData_->get(static_cast<int>(column));
  const SQLSMALLINT originalSqlType = colDef.dataType;

  SQL_LOG_DEBUG_STREAM("get_data_long: originalSqlType SQL type: " << originalSqlType);

  SQL_LOG_TRACE_STREAM("get_data_long: calling SQLGetData");
  const auto ret = odbcApi_->SQLGetData(statement,
                                        static_cast<SQLUSMALLINT>(column + 1),
                                        SQL_C_SLONG,
                                        &v,
                                        sizeof(int32_t),
                                        &str_len_or_ind_ptr);
  if (!check_odbc_error(ret)) {
    column_data.setNull();
    return false;
  }

  if (str_len_or_ind_ptr == SQL_NULL_DATA) {
    column_data.setNull();
    return true;
  }

  SQL_LOG_DEBUG_STREAM("get_data_long: value read = " << v);

  // Set the correct type based on the original SQL type
  // For any other case, use BigInt as the default
  auto datumType = DatumStorage::SqlType::BigInt;
  column_data.setType(datumType);
  column_data.addValue(static_cast<int64_t>(v));

  SQL_LOG_DEBUG_STREAM("get_data_long: Mapped to DatumStorage type: " << static_cast<int>(datumType)
                                                                      << ", stored value: "
                                                                      << static_cast<int64_t>(v));

  return true;
}

bool OdbcStatement::get_data_big_int(const size_t row_id, const size_t column) {
  SQL_LOG_TRACE_STREAM("get_data_big_int: row_id " << row_id << " column " << column);
  const auto& statement = statement_->get_handle();
  DatumStorage::bigint_t v = 0;
  SQLLEN str_len_or_ind_ptr = 0;
  const auto row = rows_[row_id];
  auto& column_data = row->getColumn(column);

  SQL_LOG_TRACE_STREAM("get_data_big_int: calling SQLGetData");
  const auto ret = odbcApi_->SQLGetData(statement,
                                        static_cast<SQLUSMALLINT>(column + 1),
                                        SQL_C_SBIGINT,
                                        &v,
                                        sizeof(DatumStorage::bigint_t),
                                        &str_len_or_ind_ptr);
  if (!check_odbc_error(ret)) {
    column_data.setNull();
    return false;
  }
  if (str_len_or_ind_ptr == SQL_NULL_DATA) {
    column_data.setNull();
    return true;
  }
  if (IsNumericStringEnabled()) {
    auto str = std::to_wstring(v);
    column_data.addValue(str);
    column_data.setType(DatumStorage::SqlType::NVarChar);
  } else {
    // Logging to help diagnose any issues with BigInt handling
    SQL_LOG_DEBUG_STREAM("get_data_big_int: Setting BigInt value " << v);
    SQL_LOG_DEBUG_STREAM("get_data_big_int: bigint_t size = " << sizeof(DatumStorage::bigint_t)
                                                              << ", int64_t size = "
                                                              << sizeof(int64_t));

    // Set the type to BigInt first, then add the value
    // This ensures consistent storage type
    column_data.setType(DatumStorage::SqlType::BigInt);

    // Explicitly store as int64_t to ensure consistent type usage
    column_data.addValue(static_cast<int64_t>(v));
  }
  return true;
}

bool OdbcStatement::get_data_decimal(const size_t row_id, const size_t column) {
  SQL_LOG_TRACE_STREAM("get_data_decimal: row_id " << row_id << " column " << column);
  const auto& statement = statement_->get_handle();
  double v = 0.0;
  SQLLEN str_len_or_ind_ptr = 0;
  const auto row = rows_[row_id];
  auto& column_data = row->getColumn(column);

  SQL_LOG_TRACE_STREAM("get_data_decimal: calling SQLGetData");
  const auto ret = odbcApi_->SQLGetData(statement,
                                        static_cast<SQLUSMALLINT>(column + 1),
                                        SQL_C_DOUBLE,
                                        &v,
                                        sizeof(double),
                                        &str_len_or_ind_ptr);
  if (!check_odbc_error(ret)) {
    column_data.setNull();
    return false;
  }

  if (str_len_or_ind_ptr == SQL_NULL_DATA) {
    column_data.setNull();
    return true;
  }

  const auto v2 = trunc(v);
  if (v2 == v &&
      v2 >= static_cast<long double>(std::numeric_limits<DatumStorage::bigint_t>::min()) &&
      v2 <= static_cast<long double>(std::numeric_limits<DatumStorage::bigint_t>::max())) {
    auto bi = static_cast<DatumStorage::bigint_t>(v);
    if (IsNumericStringEnabled()) {
      auto str = std::to_wstring(bi);
      column_data.addValue(str);
      column_data.setType(DatumStorage::SqlType::NVarChar);
    } else {
      column_data.setType(DatumStorage::SqlType::BigInt);
      // Explicitly convert to int64_t for consistent storage
      column_data.addValue(static_cast<int64_t>(bi));
    }
  } else {
    if (IsNumericStringEnabled()) {
      auto str = std::to_wstring(v);
      column_data.addValue(str);
      column_data.setType(DatumStorage::SqlType::NVarChar);
    } else {
      column_data.setType(DatumStorage::SqlType::Double);
      column_data.addValue(v);
    }
  }

  return true;
}

bool OdbcStatement::get_data_bit(const size_t row_id, const size_t column) {
  SQL_LOG_TRACE_STREAM("get_data_bit: row_id " << row_id << " column " << column);
  const auto& statement = statement_->get_handle();
  char v = 0;
  SQLLEN str_len_or_ind_ptr = 0;
  const auto row = rows_[row_id];
  auto& column_data = row->getColumn(column);

  SQL_LOG_TRACE_STREAM("get_data_bit: calling SQLGetData");
  const auto ret = odbcApi_->SQLGetData(statement,
                                        static_cast<SQLUSMALLINT>(column + 1),
                                        SQL_C_BIT,
                                        &v,
                                        sizeof(char),
                                        &str_len_or_ind_ptr);
  if (!check_odbc_error(ret)) {
    column_data.setNull();
    return false;
  }

  if (str_len_or_ind_ptr == SQL_NULL_DATA) {
    column_data.setNull();
    return true;
  }

  column_data.setType(DatumStorage::SqlType::Bit);
  column_data.addValue(static_cast<int8_t>(v != 0 ? 1 : 0));
  return true;
}

bool OdbcStatement::d_variant(const size_t row_id, const size_t column) {
  SQL_LOG_TRACE_STREAM("d_variant: row_id " << row_id << " column " << column);
  const auto& statement = statement_->get_handle();
  const auto row = rows_[row_id];
  auto& column_data = row->getColumn(column);
  SQLLEN variant_type = 0;
  SQLLEN iv = 0;
  char b = 0;

  // Figure out the length
  SQL_LOG_TRACE_STREAM("d_variant: calling SQLGetData to get length");
  auto ret = odbcApi_->SQLGetData(
      statement, static_cast<SQLUSMALLINT>(column + 1), SQL_C_BINARY, &b, 0, &iv);
  if (!check_odbc_error(ret)) {
    column_data.setNull();
    return false;
  }

  // Figure out the type
  SQL_LOG_TRACE_STREAM("d_variant: calling SQLColAttribute for SQL_CA_SS_VARIANT_TYPE");
  ret = odbcApi_->SQLColAttributeW(
      statement, column + 1, SQL_CA_SS_VARIANT_TYPE, nullptr, 0, nullptr, &variant_type);
  if (!check_odbc_error(ret)) {
    column_data.setNull();
    return false;
  }

  // Add more logging to help diagnose variant type issues
  SQL_LOG_DEBUG_STREAM("d_variant: Variant type detected: " << variant_type);

  // Get the column data and mark it explicitly as Variant type

  // Set the type to Variant for special handling in JsObjectMapper
  column_data.setType(DatumStorage::SqlType::Variant);

  // Create a copy of the definition and modify it
  auto definition = metaData_->get(static_cast<int>(column));
  definition.dataType = static_cast<SQLSMALLINT>(variant_type);

  // Dispatch to the correct handler based on the variant's actual type
  // but mark the result explicitly as a variant for special handling
  const auto res = dispatch(definition.dataType, row_id, column);
  return res;
}

bool OdbcStatement::bounded_string_wchar(size_t display_size,
                                         const size_t row_id,
                                         const size_t column) {
  SQL_LOG_TRACE_STREAM("bounded_string_wchar: display_size " << display_size << " row_id " << row_id
                                                             << " column " << column);

  auto row = rows_[row_id];
  auto& column_data = row->getColumn(column);

  // Mark this as a Unicode/wide string type for consistent handling in JS
  column_data.setType(DatumStorage::SqlType::NVarChar);

  constexpr auto size = sizeof(uint16_t);
  SQLLEN value_len = 0;
  display_size++;
  column_data.reserve(display_size);
  column_data.resize(display_size);  // increment for null terminator
  auto src_data = column_data.getTypedVector<uint16_t>()->data();

  SQL_LOG_TRACE_STREAM("bounded_string_wchar: calling SQLGetData");
  const auto r = odbcApi_->SQLGetData(statement_->get_handle(),
                                      static_cast<SQLUSMALLINT>(column + 1),
                                      SQL_C_WCHAR,
                                      src_data,
                                      display_size * size,
                                      &value_len);

  if (r != SQL_NO_DATA && !check_odbc_error(r)) {
    column_data.setNull();
    return false;
  }

  if (r == SQL_NO_DATA || value_len == SQL_NULL_DATA) {
    column_data.setNull();
    return true;
  }

  value_len /= size;
  column_data.resize(value_len);
  // assert(value_len >= 0 && value_len <= display_size - 1);
  SQL_LOG_TRACE_STREAM("datum: " << column_data.getDebugString());
  column_data.setNull(false);
  return true;
}

bool OdbcStatement::bounded_string_char(size_t display_size,
                                        const size_t row_id,
                                        const size_t column) {
  SQL_LOG_TRACE_STREAM("bounded_string_char: display_size " << display_size << " row_id " << row_id
                                                            << " column " << column);

  auto row = rows_[row_id];
  auto& column_data = row->getColumn(column);

  // Mark this as a varchar type for consistent handling in JS
  column_data.setType(DatumStorage::SqlType::VarChar);

  constexpr auto size = sizeof(char);
  SQLLEN value_len = 0;
  display_size++;
  column_data.reserve(display_size);
  column_data.resize(display_size);  // increment for null terminator
  auto src_data = column_data.getTypedVector<char>()->data();

  SQL_LOG_TRACE_STREAM("bounded_string_char: calling SQLGetData");
  const auto r = odbcApi_->SQLGetData(statement_->get_handle(),
                                      static_cast<SQLUSMALLINT>(column + 1),
                                      SQL_C_CHAR,
                                      src_data,
                                      static_cast<SQLLEN>(display_size * size),
                                      &value_len);

  if (r != SQL_NO_DATA && !check_odbc_error(r)) {
    column_data.setNull();
    return false;
  }

  if (r == SQL_NO_DATA || value_len == SQL_NULL_DATA) {
    column_data.setNull();
    return true;
  }

  // For char strings, we don't need to divide by size since they're single-byte
  column_data.resize(value_len);

  SQL_LOG_TRACE_STREAM("datum (char): " << column_data.getDebugString());
  column_data.setNull(false);
  return true;
}

// For backward compatibility with any code that might call the old methods
bool OdbcStatement::bounded_string(const size_t display_size,
                                   const size_t row_id,
                                   const size_t column) {
  // Call the wide character version by default for backward compatibility
  return bounded_string_wchar(display_size, row_id, column);
}

bool OdbcStatement::lob(const size_t row_id, size_t column) {
  // Call the wide character version by default for backward compatibility
  return lob_wchar(row_id, column);
}

bool OdbcStatement::try_read_string(const bool is_variant,
                                    const size_t row_id,
                                    const size_t column) {
  SQL_LOG_TRACE_STREAM("try_read_string: is_variant " << is_variant << " row_id " << row_id
                                                      << " column " << column);

  SQLLEN display_size = 0;
  auto row = rows_[row_id];
  auto& column_data = row->getColumn(column);

  // Get the column data type to determine if it's wide or narrow character
  SQLSMALLINT data_type = SQL_UNKNOWN_TYPE;
  if (metaData_ && column < metaData_->get_column_count()) {
    data_type = metaData_->get(static_cast<int>(column)).dataType;
    SQL_LOG_DEBUG_STREAM("try_read_string: column data type = " << data_type);
  }

  // Check if we're dealing with a wide (Unicode) or narrow (ASCII) string
  bool is_wide_char = true;
  if (data_type == SQL_CHAR || data_type == SQL_VARCHAR) {
    is_wide_char = false;
  }

  SQL_LOG_TRACE_STREAM("try_read_string: is_wide_char=" << (is_wide_char ? "true" : "false"));

  SQL_LOG_TRACE_STREAM("try_read_string: calling SQLColAttribute for SQL_DESC_DISPLAY_SIZE");
  const auto r = odbcApi_->SQLColAttributeW(statement_->get_handle(),
                                            static_cast<SQLUSMALLINT>(column + 1),
                                            SQL_DESC_DISPLAY_SIZE,
                                            nullptr,
                                            0,
                                            nullptr,
                                            &display_size);

  if (!check_odbc_error(r)) {
    column_data.setNull();
    return false;
  }

  // when a field type is LOB, we read a packet at time and pass that back.
  if (display_size == 0 || display_size == std::numeric_limits<int>::max() ||
      display_size == std::numeric_limits<int>::max() >> 1 ||
      static_cast<unsigned long>(display_size) == std::numeric_limits<unsigned long>::max() - 1) {
    return is_wide_char ? lob_wchar(row_id, column) : lob_char(row_id, column);
  }

  if (display_size >= 1 && display_size <= SQL_SERVER_MAX_STRING_SIZE) {
    return is_wide_char ? bounded_string_wchar(display_size, row_id, column)
                        : bounded_string_char(display_size, row_id, column);
  }

  return true;
}

bool OdbcStatement::get_data_binary(const size_t row_id, const size_t column) {
  SQL_LOG_TRACE_STREAM("get_data_binary: row_id " << row_id << " column " << column);
  const auto& statement = statement_->get_handle();
  auto row = rows_[row_id];
  auto& column_data = row->getColumn(column);

  constexpr SQLLEN atomic_read = 24 * 1024;
  auto bytes_to_read = atomic_read;

  // First set the type before reserving space
  column_data.setType(DatumStorage::SqlType::Binary);

  // Create a buffer for the first read
  std::vector<char> buffer(bytes_to_read);
  char* write_ptr = buffer.data();
  if (!write_ptr) {
    SQL_LOG_ERROR("get_data_binary: Failed to allocate temporary buffer");
    column_data.setNull();
    return false;
  }

  // Read the first chunk
  SQLLEN total_bytes_to_read = 0;
  SQL_LOG_TRACE_STREAM("get_data_binary: calling SQLGetData for first chunk");
  auto r = odbcApi_->SQLGetData(statement,
                                static_cast<SQLUSMALLINT>(column + 1),
                                SQL_C_BINARY,
                                write_ptr,
                                bytes_to_read,
                                &total_bytes_to_read);

  // Check for any SQL errors
  if (!check_odbc_error(r)) {
    SQL_LOG_ERROR("get_data_binary: SQL error in first chunk read");
    column_data.setNull();
    return false;
  }

  // Handle NULL data
  if (total_bytes_to_read == SQL_NULL_DATA) {
    column_data.setNull();
    return true;
  }

  // Now we know how much data we're going to get, so reserve space in the vector
  SQL_LOG_DEBUG_STREAM("get_data_binary: total_bytes_to_read = " << total_bytes_to_read);

  // Check for more data flag
  auto status = false;
  auto more = check_more_read(r, status);
  if (!status) {
    SQL_LOG_ERROR("get_data_binary: Error checking for more data");
    column_data.setNull();
    return false;
  }

  // Special case for empty data
  if (total_bytes_to_read == 0) {
    // Create empty binary data (not null)
    auto char_data = column_data.getTypedVector<char>();
    if (!char_data) {
      SQL_LOG_ERROR("get_data_binary: Failed to create vector for empty binary data");
      column_data.setNull();
      return false;
    }
    char_data->clear();
    column_data.setNull(false);
    return true;
  }

  try {
    // Create the vector only after we've determined the size
    column_data.reserve(total_bytes_to_read + 1);  // +1 for safety
    auto char_data = column_data.getTypedVector<char>();
    if (!char_data) {
      SQL_LOG_ERROR("get_data_binary: Failed to create vector for binary data");
      column_data.setNull();
      return false;
    }

    // Resize to accommodate the data we're expecting
    char_data->resize(total_bytes_to_read);

    // Copy the first chunk of data
    size_t bytes_read = 0;
    if (total_bytes_to_read > 0) {
      bytes_read =
          std::min(static_cast<size_t>(bytes_to_read), static_cast<size_t>(total_bytes_to_read));
      SQL_LOG_DEBUG_STREAM("get_data_binary: Copying first chunk, bytes_read = " << bytes_read);

      if (char_data->empty() || !char_data->data()) {
        SQL_LOG_ERROR("get_data_binary: Target vector is empty or has null data pointer");
        column_data.setNull();
        return false;
      }

      std::memcpy(char_data->data(), buffer.data(), bytes_read);
    }

    // Handle reading more data if needed
    if (more) {
      if (char_data->size() <= bytes_read) {
        SQL_LOG_ERROR("get_data_binary: Vector size too small for remaining data");
        column_data.setNull();
        return false;
      }

      write_ptr = char_data->data() + bytes_read;
      SQLLEN remaining = total_bytes_to_read - bytes_read;

      SQL_LOG_DEBUG_STREAM("get_data_binary: Reading more data, remaining = " << remaining);

      while (more && remaining > 0) {
        bytes_to_read = std::min(static_cast<SQLLEN>(atomic_read), remaining);

        SQL_LOG_TRACE_STREAM("get_data_binary: calling SQLGetData for additional chunk");
        r = odbcApi_->SQLGetData(statement,
                                 static_cast<SQLUSMALLINT>(column + 1),
                                 SQL_C_BINARY,
                                 write_ptr,
                                 bytes_to_read,
                                 &total_bytes_to_read);

        if (!check_odbc_error(r)) {
          SQL_LOG_ERROR("get_data_binary: SQL error in subsequent chunk read");
          column_data.setNull();
          return false;
        }

        more = check_more_read(r, status);
        if (!status) {
          SQL_LOG_ERROR("get_data_binary: Error checking for more data during chunked read");
          column_data.setNull();
          return false;
        }

        // Calculate actual bytes read in this chunk for pointer advancement
        SQLLEN actual_chunk_bytes = (total_bytes_to_read == SQL_NULL_DATA)
                                        ? 0
                                        : std::min(bytes_to_read, total_bytes_to_read);

        // Move pointer forward
        write_ptr += actual_chunk_bytes;
        remaining -= actual_chunk_bytes;

        SQL_LOG_DEBUG_STREAM("get_data_binary: After chunk read, remaining = " << remaining);
      }
    }

    // For empty binary data, we preserve empty data rather than null
    if (char_data->empty()) {
      column_data.setNull(false);  // Empty binary is not null
    } else {
      column_data.setNull(false);
    }
  } catch (const std::exception& e) {
    SQL_LOG_ERROR_STREAM("get_data_binary: Exception - " << e.what());
    column_data.setNull();
    return false;
  }

  return true;
}

bool OdbcStatement::get_data_timestamp_offset(const size_t row_id, const size_t column) {
  SQL_LOG_TRACE_STREAM("get_data_timestamp_offset: row_id " << row_id << " column " << column);
  const auto& statement = statement_->get_handle();
  SQLLEN str_len_or_ind_ptr = 0;
  auto row = rows_[row_id];
  auto& column_data = row->getColumn(column);

  column_data.reserve(sizeof(SQL_SS_TIMESTAMPOFFSET_STRUCT));
  column_data.setType(DatumStorage::SqlType::DateTimeOffset);

  SQL_SS_TIMESTAMPOFFSET_STRUCT ts_offset;

  SQL_LOG_TRACE_STREAM("get_data_timestamp_offset: calling SQLGetData");
  const auto ret = odbcApi_->SQLGetData(statement,
                                        static_cast<SQLUSMALLINT>(column + 1),
                                        SQL_C_DEFAULT,
                                        &ts_offset,
                                        sizeof(SQL_SS_TIMESTAMPOFFSET_STRUCT),
                                        &str_len_or_ind_ptr);
  if (!check_odbc_error(ret)) {
    column_data.setNull();
    return false;
  }

  if (str_len_or_ind_ptr == SQL_NULL_DATA) {
    column_data.setNull();
    return true;
  }

  column_data.addValue(ts_offset);
  return true;
}

bool OdbcStatement::d_time(const size_t row_id, const size_t column) {
  SQL_LOG_TRACE_STREAM("d_time: row_id " << row_id << " column " << column);
  const auto& statement = statement_->get_handle();
  SQLLEN str_len_or_ind_ptr = 0;
  auto row = rows_[row_id];
  auto& column_data = row->getColumn(column);

  SQL_SS_TIME2_STRUCT time = {};
  SQLLEN precision = 0;
  SQLLEN colscale = 0;

  SQL_LOG_TRACE_STREAM("d_time: calling SQLColAttribute for SQL_COLUMN_PRECISION");
  const auto ret2 = odbcApi_->SQLColAttributeW(statement,
                                               static_cast<SQLUSMALLINT>(column + 1),
                                               SQL_COLUMN_PRECISION,
                                               nullptr,
                                               0,
                                               nullptr,
                                               &precision);
  if (!check_odbc_error(ret2)) {
    column_data.setNull();
    return false;
  }

  SQL_LOG_TRACE_STREAM("d_time: calling SQLColAttribute for SQL_COLUMN_SCALE");
  const auto ret3 = odbcApi_->SQLColAttributeW(statement,
                                               static_cast<SQLUSMALLINT>(column + 1),
                                               SQL_COLUMN_SCALE,
                                               nullptr,
                                               0,
                                               nullptr,
                                               &colscale);
  if (!check_odbc_error(ret3)) {
    column_data.setNull();
    return false;
  }

  SQL_LOG_TRACE_STREAM("d_time: calling SQLGetData");
  const auto ret = odbcApi_->SQLGetData(statement,
                                        static_cast<SQLUSMALLINT>(column + 1),
                                        SQL_C_BINARY,
                                        &time,
                                        sizeof(time),
                                        &str_len_or_ind_ptr);
  if (!check_odbc_error(ret)) {
    column_data.setNull();
    return false;
  }

  if (str_len_or_ind_ptr == SQL_NULL_DATA) {
    column_data.setNull();
    return true;
  }

  column_data.setType(DatumStorage::SqlType::Time);

  SQL_SS_TIMESTAMPOFFSET_STRUCT datetime = {};
  datetime.year = 1900;  // Default year
  datetime.month = 1;    // Default month
  datetime.day = 1;      // Default day
  datetime.hour = time.hour;
  datetime.minute = time.minute;
  datetime.second = time.second;
  datetime.fraction = time.fraction;

  column_data.addValue(datetime);
  return true;
}

bool OdbcStatement::get_data_timestamp(const size_t row_id, const size_t column) {
  SQL_LOG_TRACE_STREAM("get_data_timestamp: row_id " << row_id << " column " << column);
  const auto& statement = statement_->get_handle();
  SQLLEN str_len_or_ind_ptr = 0;
  auto row = rows_[row_id];
  auto& column_data = row->getColumn(column);

  TIMESTAMP_STRUCT ts;

  SQL_LOG_TRACE_STREAM("get_data_timestamp: calling SQLGetData");
  const auto ret = odbcApi_->SQLGetData(statement,
                                        static_cast<SQLUSMALLINT>(column + 1),
                                        SQL_C_TIMESTAMP,
                                        &ts,
                                        sizeof(TIMESTAMP_STRUCT),
                                        &str_len_or_ind_ptr);
  if (!check_odbc_error(ret)) {
    column_data.setNull();
    return false;
  }

  if (str_len_or_ind_ptr == SQL_NULL_DATA) {
    column_data.setNull();
    return true;
  }

  column_data.setType(DatumStorage::SqlType::DateTime);
  column_data.addValue(ts);
  return true;
}

bool OdbcStatement::apply_precision(const std::shared_ptr<SqlParameter>& datum,
                                    const int current_param) {
  /* Modify the fields in the implicit application parameter descriptor */
  SQLHDESC hdesc = nullptr;
  const auto c_type = OdbcTypeMapper::parseOdbcTypeString(datum->c_type);
  const SQLINTEGER bufferLength = 0;
  auto statement = statement_->get_handle();
  auto r = odbcApi_->SQLGetStmtAttr(statement, SQL_ATTR_APP_PARAM_DESC, &hdesc, 0, nullptr);
  if (!check_odbc_error(r)) {
    return false;
  }
  r = odbcApi_->SQLSetDescField(hdesc,
                                current_param,
                                SQL_DESC_TYPE,
                                reinterpret_cast<SQLPOINTER>(static_cast<uintptr_t>(c_type)),
                                bufferLength);
  if (!check_odbc_error(r)) {
    return false;
  }
  r = odbcApi_->SQLSetDescField(hdesc,
                                current_param,
                                SQL_DESC_PRECISION,
                                reinterpret_cast<SQLPOINTER>(static_cast<uintptr_t>(
                                    static_cast<SQLUINTEGER>(datum->param_size))),
                                bufferLength);
  if (!check_odbc_error(r)) {
    return false;
  }
  r = odbcApi_->SQLSetDescField(
      hdesc,
      current_param,
      SQL_DESC_SCALE,
      reinterpret_cast<SQLPOINTER>(static_cast<uintptr_t>(static_cast<SQLUINTEGER>(datum->digits))),
      bufferLength);
  if (!check_odbc_error(r)) {
    return false;
  }
  r = odbcApi_->SQLSetDescField(hdesc,
                                current_param,
                                SQL_DESC_DATA_PTR,
                                static_cast<SQLPOINTER>(datum->storage->getStorage()->data()),
                                bufferLength);
  if (!check_odbc_error(r)) {
    return false;
  }
  return true;
}

bool OdbcStatement::bind_parameters(std::shared_ptr<BoundDatumSet> parameters) {
  // SQL_LOG_TRACE_STREAM("bind_parameters: " << parameters.size());

  // TODO: Handle array parameters when BoundDatum supports them
  auto statement = statement_->get_handle();

  auto current_param = 1;
  for (const auto& datum : *parameters) {
    const auto storage = datum->get_storage();
    const auto c_type = datum->c_type;
    const auto sql_type = datum->sql_type;
    const auto param_type = datum->param_type;
    SQL_LOG_DEBUG_STREAM("Binding parameter " << current_param);
    auto ret = odbcApi_->SQLBindParameter(statement,
                                          static_cast<SQLUSMALLINT>(current_param),
                                          param_type,
                                          c_type,
                                          sql_type,
                                          datum->param_size,
                                          datum->digits,
                                          datum->buffer,
                                          datum->buffer_len,
                                          datum->get_ind_vec().data());

    if (!check_odbc_error(ret)) {
      SQL_LOG_ERROR_STREAM("Failed to bind parameter " << current_param);
      state_ = State::STATEMENT_ERROR;
      return false;
    }

    ++current_param;
  }
  return true;
}
}  // namespace mssql