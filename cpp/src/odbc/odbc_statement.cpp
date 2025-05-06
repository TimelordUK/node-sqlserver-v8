#include "common/platform.h"
#include "common/odbc_common.h"
#include "odbc/iodbc_api.h"
#include "odbc/odbc_statement.h"
#include "odbc/odbc_error_handler.h"
#include "common/string_utils.h"
#include "utils/Logger.h"

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
        // fprintf(stderr, "fetch_read check_odbc_error\n");
        return false;
      }
      result->set_end_of_rows(false);
      res = true;
      const auto column_count = static_cast<int>(result->get_column_count());
      for (auto c = 0; c < column_count; ++c)
      {
        const auto &definition = result->get(c);
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
    lob_capture() : total_bytes_to_read(atomic_read_bytes)
    {
      // storage.ReserveUint16(atomic_read_bytes / item_size + 1);
      // src_data = storage.uint16vec_ptr;
      write_ptr = src_data->data();
      maxvarchar = false;
    }

    void trim() const
    {
      if (maxvarchar)
      {
        auto last = src_data->size() - 1;
        if (maxvarchar)
        {
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
    DatumStorage storage;
    SQLLEN total_bytes_to_read;
  };

  bool OdbcStatement::lob(const size_t row_id, size_t column)
  {
    // cerr << "lob ..... " << endl;
    const auto &statement = statement_->get_handle();
    lob_capture capture;
    auto r = SQLGetData(statement, static_cast<SQLSMALLINT>(column + 1), SQL_C_WCHAR, capture.write_ptr, capture.bytes_to_read + capture.item_size, &capture.total_bytes_to_read);
    if (capture.total_bytes_to_read == SQL_NULL_DATA)
    {
      // cerr << "lob NullColumn " << endl;
      //_resultset->add_column(row_id, make_shared<NullColumn>(column));
      return true;
    }
    if (!check_odbc_error(r))
      return false;
    auto status = false;
    auto more = check_more_read(r, status);
    if (!status)
    {
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
        // cerr << "lob error " << endl;
        return false;
      }
      more = check_more_read(r, status);
      if (!status)
      {
        // cerr << "lob status " << endl;
        return false;
      }
    }
    capture.trim();
    // cerr << "lob add StringColumn column " << endl;
    //_resultset->add_column(row_id, make_shared<StringColumn>(column, capture.src_data, capture.src_data->size()));
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
      // onst auto state = swcvec2str(sql_state, sql_state.size());
      // cerr << "check_more_read " << status << endl;
      // res = state == "01004";
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

  bool OdbcStatement::try_read_string(const bool is_variant, const size_t row_id, const size_t column)
  {
    SQL_LOG_TRACE_STREAM("try_read_string: is_variant " << is_variant << " row_id " << row_id << " column " << column);
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