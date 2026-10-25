#include <common/platform.h>

#include <algorithm>
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
#include <odbc/odbc_statement_legacy.h>
#include <js/columns/column_set.h>
#include <common/numeric_utils.h>
#include <odbc/bcp.h>
#include <js/columns/result_set.h>
#include <odbc/odbc_driver_types.h>
#include <utils/Logger.h>

const int SQL_SERVER_MAX_STRING_SIZE = 8000;

// default size to retrieve from a LOB field and we don't know the size
// const int LOB_PACKET_SIZE = 8192;  // Currently unused

namespace mssql {

bool OdbcStatementLegacy::get_data_binary(const size_t row_id, const size_t column) {
  auto storage = make_shared<DatumStorageLegacy>();

  const auto& statement = *_statement;
  constexpr SQLLEN atomic_read = 24 * 1024;
  auto bytes_to_read = atomic_read;
  storage->ReserveChars(bytes_to_read + 1);
  const auto& char_data = storage->charvec_ptr;
  auto* write_ptr = char_data->data();
  SQLLEN total_bytes_to_read = 0;
  auto r = _odbcApi->SQLGetData(statement.get_handle(),
                                static_cast<SQLSMALLINT>(column + 1),
                                SQL_C_BINARY,
                                write_ptr,
                                bytes_to_read,
                                &total_bytes_to_read);
  if (!check_odbc_error(r)) {
    SQL_LOG_DEBUG_STREAM("get_data_binary failed to get data");
    return false;
  }
  if (total_bytes_to_read == SQL_NULL_DATA) {
    _resultset->add_column(row_id, make_shared<NullColumn>(column));
    return true;  // break
  }
  auto status = false;
  auto more = check_more_read(r, status);
  if (!status) {
    return false;
  }
  char_data->resize(total_bytes_to_read);

  if (total_bytes_to_read > bytes_to_read) {
    total_bytes_to_read -= bytes_to_read;
  }
  write_ptr = char_data->data();
  write_ptr += bytes_to_read;
  while (more) {
    bytes_to_read = min(static_cast<SQLLEN>(atomic_read), total_bytes_to_read);
    r = _odbcApi->SQLGetData(statement.get_handle(),
                             static_cast<SQLSMALLINT>(column + 1),
                             SQL_C_BINARY,
                             write_ptr,
                             bytes_to_read,
                             &total_bytes_to_read);
    if (!check_odbc_error(r)) {
      SQL_LOG_DEBUG_STREAM("get_data_binary failed to get data");
      return false;
    }
    more = check_more_read(r, status);
    if (!status) {
      return false;
    }
    write_ptr += bytes_to_read;
  }

  _resultset->add_column(row_id, make_shared<BinaryColumn>(column, storage, char_data->size()));
  return true;
}

bool OdbcStatementLegacy::check_more_read(SQLRETURN r, bool& status) {
  const auto& statement = *_statement;
  vector<SQLWCHAR> sql_state(6);
  SQLINTEGER native_error = 0;
  SQLSMALLINT text_length = 0;
  auto res = false;
  if (r == SQL_SUCCESS_WITH_INFO) {
    r = _odbcApi->SQLGetDiagRec(SQL_HANDLE_STMT,
                                statement.get_handle(),
                                1,
                                sql_state.data(),
                                &native_error,
                                nullptr,
                                0,
                                &text_length);
    if (!check_odbc_error(r)) {
      SQL_LOG_DEBUG_STREAM("check_more_read failed to get diag rec");
      status = false;
      return false;
    }
    const auto state = odbcstr::swcvec2str(sql_state, sql_state.size());
    // cerr << "check_more_read " << status << endl;
    res = state == "01004";
  }
  status = true;
  return res;
}

struct lob_capture {
  lob_capture() : maxvarchar(false), total_bytes_to_read(atomic_read_bytes) {
    storage.ReserveUint16(atomic_read_bytes / item_size + 1);
    src_data = storage.uint16vec_ptr;
    write_ptr = src_data->data();
  }

  void trim() const {
    if (maxvarchar) {
      auto last = src_data->size() - 1;
      if (maxvarchar) {
        while ((*src_data)[last] == 0) {
          --last;
        }
        if (last < src_data->size() - 1) {
          src_data->resize(last + 1);
        }
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

  void print_state() const {
    SQL_LOG_DEBUG_STREAM("lob_capture state " << reads << " " << n_items << " " << maxvarchar << " "
                                              << total_bytes_to_read << " " << bytes_to_read << " "
                                              << atomic_read_bytes << " " << item_size);
  }

  SQLLEN reads = 1;
  size_t n_items = 0;
  bool maxvarchar;
  const size_t item_size = sizeof(uint16_t);
  shared_ptr<vector<uint16_t>> src_data{};
  unsigned short* write_ptr{};
  const SQLLEN atomic_read_bytes = 24 * 1024;
  SQLLEN bytes_to_read = atomic_read_bytes;
  DatumStorageLegacy storage;
  SQLLEN total_bytes_to_read;
};

bool OdbcStatementLegacy::lob(const size_t row_id, size_t column) {
  // cerr << "lob ..... " << endl;
  const auto& statement = *_statement;
  lob_capture capture;
  auto r = _odbcApi->SQLGetData(statement.get_handle(),
                                static_cast<SQLSMALLINT>(column + 1),
                                SQL_C_WCHAR,
                                capture.write_ptr,
                                capture.bytes_to_read + capture.item_size,
                                &capture.total_bytes_to_read);
  if (capture.total_bytes_to_read == SQL_NULL_DATA) {
    // cerr << "lob NullColumn " << endl;
    _resultset->add_column(row_id, make_shared<NullColumn>(column));
    return true;
  }

  // Track the total actual bytes of data we've read
  // SQLLEN total_bytes_read = 0;  // Currently unused but kept for potential future use

  if (!check_odbc_error(r)) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] lob failed to get data " << r);
    return false;
  }
  auto status = false;
  auto more = check_more_read(r, status);
  if (!status) {
    // cerr << "lob check_more_read " << endl;
    return false;
  }

  // For the first read, if all data fit, total_bytes_to_read contains the actual byte count
  if (!more) {
    // All data fit in first read
    // total_bytes_read = capture.total_bytes_to_read;
  } else {
    // Data didn't fit, we need to read in chunks
    // total_bytes_read = capture.bytes_to_read;
  }

  capture.on_first_read();
  while (more) {
    // Handle SQL_NO_TOTAL (-4) case - use atomic_read_bytes when total is negative
    if (capture.total_bytes_to_read < 0) {
      capture.bytes_to_read = capture.atomic_read_bytes;
    } else {
      capture.bytes_to_read = min(capture.atomic_read_bytes, capture.total_bytes_to_read);
    }
    r = _odbcApi->SQLGetData(statement.get_handle(),
                             static_cast<SQLSMALLINT>(column + 1),
                             SQL_C_WCHAR,
                             capture.write_ptr,
                             capture.bytes_to_read + capture.item_size,
                             &capture.total_bytes_to_read);
    capture.on_next_read();
    if (!check_odbc_error(r)) {
      SQL_LOG_DEBUG_STREAM("lob failed to get data");
      // cerr << "lob error " << endl;
      return false;
    }

    // Add the bytes from this chunk
    // total_bytes_read += capture.bytes_to_read;

    more = check_more_read(r, status);
    if (!status) {
      // cerr << "lob status " << endl;
      return false;
    }
  }

  // Trim trailing zeros if this was a varchar(max) field
  capture.trim();

  // Calculate actual string length in UTF-16 code units
  // After trimming, use the actual size of the vector
  const size_t actual_char_count = capture.src_data->size();

  // cerr << "lob add StringColumn column " << endl;
  _resultset->add_column(row_id,
                         make_shared<StringColumn>(column, capture.src_data, actual_char_count));
  return true;
}

bool OdbcStatementLegacy::bounded_string(SQLLEN display_size, const size_t row_id, size_t column) {
  // cerr << "bounded_string ... " << endl;

  const auto storage = make_shared<DatumStorageLegacy>();
  constexpr auto size = sizeof(uint16_t);
  SQLLEN value_len = 0;

  display_size++;
  storage->ReserveUint16(display_size);  // increment for null terminator

  // IMPORTANT: After ReserveUint16, the vector has size=display_size filled with zeros
  // We need to get a pointer to write data into this pre-allocated space
  const auto r = _odbcApi->SQLGetData(_statement->get_handle(),
                                      static_cast<SQLSMALLINT>(column + 1),
                                      SQL_C_WCHAR,
                                      storage->uint16vec_ptr->data(),
                                      display_size * size,
                                      &value_len);

  if (r != SQL_NO_DATA && !check_odbc_error(r))
    return false;

  if (r == SQL_NO_DATA || value_len == SQL_NULL_DATA) {
    _resultset->add_column(row_id, make_shared<NullColumn>(column));
    return true;
  }

  // value_len is in bytes, convert to UTF-16 code units
  value_len /= size;

  // CRITICAL FIX: Don't resize! The data is already in the vector.
  // Just create the StringColumn with the actual length of data returned
  // The vector still has size=display_size but we only use value_len characters
  const auto value = make_shared<StringColumn>(column, storage->uint16vec_ptr, 0, value_len);
  _resultset->add_column(row_id, value);

  return true;
}

bool OdbcStatementLegacy::try_read_string(bool binary, const size_t row_id, const size_t column) {
  SQLLEN display_size = 0;
  // cerr << " try_read_string row_id = " << row_id << " column = " << column;
  const auto r = _odbcApi->SQLColAttribute(_statement->get_handle(),
                                           column + 1,
                                           SQL_DESC_DISPLAY_SIZE,
                                           nullptr,
                                           0,
                                           nullptr,
                                           &display_size);
  if (!check_odbc_error(r)) {
    SQL_LOG_DEBUG_STREAM("try_read_string failed to get col attribute");
    return false;
  }

  // when a field type is LOB, we read a packet at time and pass that back.
  if (display_size == 0 || display_size == numeric_limits<int>::max() ||
      display_size == numeric_limits<int>::max() >> 1 ||
      static_cast<unsigned long>(display_size) == numeric_limits<unsigned long>::max() - 1) {
    return lob(row_id, column);
  }

  if (display_size >= 1 && display_size <= SQL_SERVER_MAX_STRING_SIZE) {
    return bounded_string(display_size, row_id, column);
  }

  return false;
}
}  // namespace mssql
