#include "common/platform.h"
#include "common/odbc_common.h"
#include "odbc/iodbc_api.h"
#include "odbc/odbc_row.h"
#include "odbc/odbc_statement.h"
#include "odbc/odbc_error_handler.h"
#include "common/string_utils.h"
#include "utils/Logger.h"
#include "odbc_statement.h"

const int SQL_SERVER_MAX_STRING_SIZE = 8000;

// default size to retrieve from a LOB field and we don't know the size
const int LOB_PACKET_SIZE = 8192;

namespace mssql
{
  enum class ExecutionState
  {
    Initial,
    Prepared,
    Executed,
    Completed,
    Error
  };

  // Implementation of TryReadRows from the Interface
  bool OdbcStatement::TryReadRows(std::shared_ptr<QueryResult> result, const size_t number_rows)
  {
    if (number_rows == 0)
    {
      return false;
    }
    SQL_LOG_TRACE_STREAM("TryReadRows: number_rows " << number_rows);
    rows_.clear();
    rows_.reserve(number_rows);
    result->start_results();
    return fetch_read(result, number_rows);
  }

  // Legacy method for backward compatibility
  bool OdbcStatement::try_read_rows(std::shared_ptr<QueryResult> result, const size_t number_rows)
  {
    // Just delegate to the new method
    return TryReadRows(result, number_rows);
  }

  // Default implementation - derived classes should override as needed
  bool OdbcStatement::FetchNextBatch(size_t batchSize)
  {
    SQL_LOG_TRACE("OdbcStatement::FetchNextBatch - Default implementation called, should be overridden");
    return false;
  }

  // Default implementation - derived classes should override as needed
  bool OdbcStatement::NextResultSet()
  {
    SQL_LOG_TRACE("OdbcStatement::NextResultSet - Default implementation called, should be overridden");
    return false;
  }

  bool OdbcStatement::check_odbc_error(const SQLRETURN ret)
  {
    if (!errorHandler_->CheckOdbcError(ret))
    {
      return false;
    }
    return true;
  }

  bool OdbcStatement::fetch_read(std::shared_ptr<QueryResult> result, const size_t number_rows)
  {
    SQL_LOG_TRACE_STREAM("fetch_read: number_rows " << number_rows);
    auto res = false;
    for (size_t row_id = 0; row_id < number_rows; ++row_id)
    {
      const auto ret = odbcApi_->SQLFetch(statement_->get_handle());
      if (ret == SQL_NO_DATA)
      {
        // fprintf(stderr, "fetch_read SQL_NO_DATA\n");
        result->set_end_of_rows(true);
        return true;
      }
      if (!check_odbc_error(ret))
      {
        SQL_LOG_TRACE_STREAM("fetch_read: error in  SQLFetch" << number_rows);
        return false;
      }
      result->set_end_of_rows(false);
      res = true;
      const auto column_count = static_cast<int>(metaData_->get_column_count());
      SQL_LOG_TRACE_STREAM("fetch_read: column_count " << column_count);
      std::shared_ptr<IOdbcRow> row = std::make_shared<OdbcRow>(*metaData_);
      rows_.push_back(row);
      for (auto c = 0; c < column_count; ++c)
      {
        const auto &definition = metaData_->get(c);
        res = dispatch(definition.dataType, row_id, c);
        if (!res)
        {
          break;
        }
      }
    }
    return res;
  }

  struct lob_capture
  {
    lob_capture(mssql::DatumStorage &storage) : total_bytes_to_read(atomic_read_bytes), storage(storage)
    {
      storage.reserve(atomic_read_bytes / item_size + 1);
      src_data = storage.getTypedVector<uint16_t>();
      write_ptr = src_data->data();
      maxvarchar = false;
    }

    void trim() const
    {
      if (maxvarchar)
      {
        auto last = src_data->size() - 1;
        while ((*src_data)[last] == 0)
        {
          --last;
        }
        if (last < src_data->size() - 1)
        {
          src_data->resize(last + 1);
        }
      }
    }

    void on_next_read()
    {
      ++reads;
      if (total_bytes_to_read < 0)
      {
        const auto previous = src_data->size();
        total_bytes_to_read = bytes_to_read * (reads + 1);
        n_items = total_bytes_to_read / item_size;
        src_data->reserve(n_items + 1);
        src_data->resize(n_items);
        write_ptr = src_data->data() + previous;
        memset(write_ptr, 0, src_data->data() + src_data->size() - write_ptr);
      }
      else
      {
        write_ptr += bytes_to_read / item_size;
      }
    }

    void on_first_read(const int factor = 2)
    {
      maxvarchar = total_bytes_to_read < 0;
      if (maxvarchar)
      {
        total_bytes_to_read = bytes_to_read * factor;
      }
      n_items = total_bytes_to_read / item_size;
      src_data->reserve(n_items + 1);
      src_data->resize(n_items);

      if (total_bytes_to_read > bytes_to_read)
      {
        total_bytes_to_read -= bytes_to_read;
      }
      write_ptr = src_data->data();
      write_ptr += bytes_to_read / item_size;
    }

    SQLLEN reads = 1;
    size_t n_items = 0;
    bool maxvarchar;
    const size_t item_size = sizeof(uint16_t);
    shared_ptr<vector<uint16_t>> src_data{};
    unsigned short *write_ptr{};
    const SQLLEN atomic_read_bytes = 24 * 1024;
    SQLLEN bytes_to_read = atomic_read_bytes;
    DatumStorage &storage;
    SQLLEN total_bytes_to_read;
  };

  bool OdbcStatement::lob(const size_t row_id, size_t column)
  {
    // cerr << "lob ..... " << endl;
    const auto &statement = statement_->get_handle();
    auto row = rows_[row_id];
    auto &column_data = row->getColumn(column);
    lob_capture capture(column_data);
    auto r = SQLGetData(statement, static_cast<SQLSMALLINT>(column + 1), SQL_C_WCHAR, capture.write_ptr, capture.bytes_to_read + capture.item_size, &capture.total_bytes_to_read);
    if (capture.total_bytes_to_read == SQL_NULL_DATA)
    {
      column_data.setNull();
      return true;
    }
    if (!check_odbc_error(r))
      return false;
    auto status = false;
    auto more = check_more_read(r, status);
    if (!status)
    {
      SQL_LOG_TRACE_STREAM("lob check_more_read " << status);
      // cerr << "lob check_more_read " << endl;
      return false;
    }
    capture.on_first_read();
    while (more)
    {
      capture.bytes_to_read = min(capture.atomic_read_bytes, capture.total_bytes_to_read);
      r = SQLGetData(statement, static_cast<SQLSMALLINT>(column + 1), SQL_C_WCHAR, capture.write_ptr, capture.bytes_to_read + capture.item_size, &capture.total_bytes_to_read);
      capture.on_next_read();
      if (!check_odbc_error(r))
      {
        SQL_LOG_TRACE_STREAM("lob error " << r);
        return false;
      }
      more = check_more_read(r, status);
      if (!status)
      {
        SQL_LOG_TRACE_STREAM("lob status " << status);
        return false;
      }
    }
    capture.trim();

    return true;
  }

  bool OdbcStatement::check_more_read(SQLRETURN r, bool &status)
  {
    const auto &statement = statement_->get_handle();
    vector<SQLWCHAR> sql_state(6);
    SQLINTEGER native_error = 0;
    SQLSMALLINT text_length = 0;
    auto res = false;
    if (r == SQL_SUCCESS_WITH_INFO)
    {
      r = SQLGetDiagRec(SQL_HANDLE_STMT, statement, 1, sql_state.data(), &native_error, nullptr, 0, &text_length);
      if (!check_odbc_error(r))
      {
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

  bool OdbcStatement::dispatch(const SQLSMALLINT t, const size_t row_id, const size_t column)
  {
    if (!statement_)
    {
      return false;
    }

    const auto handle = statement_->get_handle();
    if (!handle)
    {
      return false;
    }

    // cerr << " dispatch row = " << row_id << endl;
    bool res;
    switch (t)
    {
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

    case SQL_SMALLINT:
    case SQL_TINYINT:
    case SQL_INTEGER:
    case SQL_C_SLONG:
    case SQL_C_SSHORT:
    case SQL_C_STINYINT:
    case SQL_C_ULONG:
    case SQL_C_USHORT:
    case SQL_C_UTINYINT:
      if (IsNumericStringEnabled())
      {
        res = try_read_string(false, row_id, column);
      }
      else
      {
        res = get_data_long(row_id, column);
      }
      break;

    case SQL_C_SBIGINT:
    case SQL_C_UBIGINT:
    case SQL_BIGINT:
      if (IsNumericStringEnabled())
      {
        res = try_read_string(false, row_id, column);
      }
      else
      {
        res = get_data_big_int(row_id, column);
      }
      break;

    case SQL_NUMERIC:
      if (IsNumericStringEnabled())
      {
        res = try_read_string(false, row_id, column);
      }
      else
      {
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

  bool OdbcStatement::get_data_long(const size_t row_id, const size_t column)
  {
    SQL_LOG_TRACE_STREAM("get_data_long: row_id " << row_id << " column " << column);
    return true;
  }

  bool OdbcStatement::get_data_big_int(const size_t row_id, const size_t column)
  {
    SQL_LOG_TRACE_STREAM("get_data_big_int: row_id " << row_id << " column " << column);
    return true;
  }

  bool OdbcStatement::get_data_decimal(const size_t row_id, const size_t column)
  {
    SQL_LOG_TRACE_STREAM("get_data_decimal: row_id " << row_id << " column " << column);
    return true;
  }

  bool OdbcStatement::get_data_bit(const size_t row_id, const size_t column)
  {
    SQL_LOG_TRACE_STREAM("get_data_bit: row_id " << row_id << " column " << column);
    return true;
  }

  bool OdbcStatement::d_variant(const size_t row_id, const size_t column)
  {
    SQL_LOG_TRACE_STREAM("d_variant: row_id " << row_id << " column " << column);
    return true;
  }

  bool OdbcStatement::bounded_string(size_t display_size, const size_t row_id, const size_t column)
  {
    SQL_LOG_TRACE_STREAM("bounded_string: display_size " << display_size << " row_id " << row_id << " column " << column);
    // cerr << "bounded_string ... " << endl;

    auto row = rows_[row_id];
    auto &column_data = row->getColumn(column);

    constexpr auto size = sizeof(uint16_t);
    SQLLEN value_len = 0;

    display_size++;
    column_data.reserve(display_size);
    column_data.resize(display_size); // increment for null terminator
    auto src_data = column_data.getTypedVector<uint16_t>()->data();
    const auto r = SQLGetData(statement_->get_handle(), static_cast<SQLSMALLINT>(column + 1), SQL_C_WCHAR, src_data, display_size * size,
                              &value_len);

    if (r != SQL_NO_DATA && !check_odbc_error(r))
      return false;

    if (r == SQL_NO_DATA || value_len == SQL_NULL_DATA)
    {
      column_data.setNull();
      return true;
    }

    value_len /= size;
    column_data.resize(value_len);
    // assert(value_len >= 0 && value_len <= display_size - 1);
    SQL_LOG_TRACE_STREAM("datum: " << column_data.getDebugString());

    return true;
  }

  bool OdbcStatement::try_read_string(const bool is_variant, const size_t row_id, const size_t column)
  {
    SQL_LOG_TRACE_STREAM("try_read_string: is_variant " << is_variant << " row_id " << row_id << " column " << column);

    SQLLEN display_size = 0;
    // cerr << " try_read_string row_id = " << row_id << " column = " << column;
    const auto r = SQLColAttribute(statement_->get_handle(), column + 1, SQL_DESC_DISPLAY_SIZE, nullptr, 0, nullptr, &display_size);
    if (!check_odbc_error(r))
      return false;

    // when a field type is LOB, we read a packet at time and pass that back.
    if (display_size == 0 || display_size == numeric_limits<int>::max() ||
        display_size == numeric_limits<int>::max() >> 1 ||
        static_cast<unsigned long>(display_size) == numeric_limits<unsigned long>::max() - 1)
    {
      return lob(row_id, column);
    }

    if (display_size >= 1 && display_size <= SQL_SERVER_MAX_STRING_SIZE)
    {
      return bounded_string(display_size, row_id, column);
    }

    return true;
  }

  bool OdbcStatement::get_data_binary(const size_t row_id, const size_t column)
  {
    SQL_LOG_TRACE_STREAM("get_data_binary: row_id " << row_id << " column " << column);
    return true;
  }

  bool OdbcStatement::get_data_timestamp_offset(const size_t row_id, const size_t column)
  {
    SQL_LOG_TRACE_STREAM("get_data_timestamp_offset: row_id " << row_id << " column " << column);
    return true;
  }

  bool OdbcStatement::d_time(const size_t row_id, const size_t column)
  {
    SQL_LOG_TRACE_STREAM("d_time: row_id " << row_id << " column " << column);
    return true;
  }

  bool OdbcStatement::get_data_timestamp(const size_t row_id, const size_t column)
  {
    SQL_LOG_TRACE_STREAM("get_data_timestamp: row_id " << row_id << " column " << column);
    return true;
  }

  bool OdbcStatement::ProcessResults(std::shared_ptr<QueryResult> &result)
  {
    // Implementation stub for build
    return true;
  }

  // Note: All TransientStatement, PreparedStatement, and TvpStatement methods
  // are implemented in their respective files which are already being compiled.
  // We removed the stub implementations here to avoid duplicate symbols.
}