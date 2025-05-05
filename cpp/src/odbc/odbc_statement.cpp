#include "common/platform.h"
#include "common/odbc_common.h"
#include "odbc/iodbc_api.h"
#include "odbc/odbc_statement.h"
#include "odbc/odbc_error_handler.h"
#include "common/string_utils.h"
#include "utils/Logger.h"
#include "odbc_statement.h"

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

  bool OdbcStatement::try_read_rows(std::shared_ptr<QueryResult> result, const size_t number_rows)
  {
    if (number_rows == 0)
    {
      return false;
    }

    result->start_results();
    return fetch_read(result, number_rows);

    // Implementation stub for build
    return true;
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
      if (isNumericStringEnabled())
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
      if (isNumericStringEnabled())
      {
        res = try_read_string(false, row_id, column);
      }
      else
      {
        res = get_data_big_int(row_id, column);
      }
      break;

    case SQL_NUMERIC:
      if (isNumericStringEnabled())
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