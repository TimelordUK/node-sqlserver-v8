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
#include "odbc_statement_legacy_internal.h"

namespace mssql {

bool OdbcStatementLegacy::try_read_columns(const size_t number_rows) {
  if (!_statement)
    return false;
  // fprintf(stderr, "try_read_columns %d\n", number_rows);
  bool res;
  _resultset->start_results();
  if (!_prepared) {
    res = fetch_read(number_rows);
  } else {
    res = prepared_read();
  }
  return res;
}

bool OdbcStatementLegacy::fetch_read(const size_t number_rows) {
  // fprintf(stderr, "fetch_read %d\n", number_rows);
  if (!_statement)
    return false;
  const auto& statement = *_statement;
  auto res = false;
  for (size_t row_id = 0; row_id < number_rows; ++row_id) {
    const auto ret = _odbcApi->SQLFetch(statement.get_handle());
    if (_cancelHandleIssued.load() && !SQL_SUCCEEDED(ret)) {
      return return_cancelled();
    }
    if (ret == SQL_NO_DATA) {
      SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] fetch_read SQL_NO_DATA " << ret);
      keep_diagnostics();
      _resultset->_end_of_rows = true;
      return true;
    }
    if (!check_odbc_error(ret)) {
      _resultset->_end_of_rows = true;
      SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] fetch_read check_odbc_error " << ret);
      // fprintf(stderr, "fetch_read check_odbc_error\n");
      return false;
    }
    if (ret == SQL_SUCCESS_WITH_INFO) {
      keep_diagnostics();
    }
    _resultset->_end_of_rows = false;
    res = true;

    // fprintf(stderr, "column_count %d\n", _resultset->get_column_count());
    const auto column_count = static_cast<int>(_resultset->get_column_count());
    for (auto c = 0; c < column_count; ++c) {
      const auto& definition = _resultset->get_meta_data(c);
      const auto errors = _errors->size();
      if (!dispatch(definition.dataType, row_id, c)) {
        // a cell that cannot be read ends the fetch with its error: drop the part of the row
        // already read, rather than go on and leave a row with holes in it (#497)
        _resultset->drop_rows_from(row_id);
        if (_errors->size() == errors) {
          // the read failed with no diagnostic from the driver: the query must still end in
          // an error, not look complete with its remaining rows missing
          const auto msg = "[msnodesql] cannot read column " + std::to_string(c) + " of the result";
          const auto error = make_shared<OdbcError>("HY000", msg.c_str(), 0, 0, "", "", 0);
          _errors->push_back(error);
          _errorHandler->AddError(error);
          set_state(OdbcStatementState::STATEMENT_ERROR);
        }
        return false;
      }
    }
  }
  return res;
}

bool OdbcStatementLegacy::dispatch(
    const SQLSMALLINT t,
    const size_t row_id,
    const size_t column) {  // NOLINT(bugprone-easily-swappable-parameters)
  if (!_statement) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] dispatch: no statement");
    return false;
  }
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
    case SQL_C_UTINYINT:
      if (_numericStringEnabled) {
        res = try_read_string(false, row_id, column);
      } else {
        res = get_data_long(row_id, column);
      }
      break;

    case SQL_SMALLINT:
    case SQL_INTEGER:
    case SQL_C_SLONG:
    case SQL_C_SSHORT:
    case SQL_C_STINYINT:
    case SQL_C_ULONG:
    case SQL_C_USHORT:
      if (_numericStringEnabled) {
        res = try_read_string(false, row_id, column);
      } else {
        res = get_data_long(row_id, column);
      }
      break;

    case SQL_C_SBIGINT:
    case SQL_C_UBIGINT:
    case SQL_BIGINT:
      if (_numericStringEnabled) {
        res = try_read_string(false, row_id, column);
      } else {
        res = get_data_big_int(row_id, column);
      }
      break;

    // decimal (and money, smallmoney) is numeric under another name: under numeric strings
    // both are the driver's exact text, never a double (#498)
    case SQL_NUMERIC:
    case SQL_DECIMAL:
      if (_numericStringEnabled) {
        res = get_data_numeric_string(row_id, column);
      } else {
        res = get_data_decimal(row_id, column);
      }
      break;

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

bool OdbcStatementLegacy::d_variant(
    const size_t row_id, const size_t column) {  // NOLINT(bugprone-easily-swappable-parameters)
  const auto& statement = *_statement;
  SQLLEN variant_type = 0;
  SQLLEN iv = 0;
  char b = 0;
  // Figure out the length
  auto ret = _odbcApi->SQLGetData(
      statement.get_handle(), static_cast<SQLSMALLINT>(column + 1), SQL_C_BINARY, &b, 0, &iv);
  if (!check_odbc_error(ret)) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] d_variant failed to get data");
    return false;
  }
  // a NULL is known from this first read; a second SQLGetData on the column would return
  // SQL_NO_DATA, and the row would be lost
  if (iv == SQL_NULL_DATA) {
    _resultset->add_column(row_id, make_shared<NullColumn>(column));
    return true;
  }
  // Figure out the type
  ret = _odbcApi->SQLColAttribute(statement.get_handle(),
                                  column + 1,
                                  SQL_CA_SS_VARIANT_TYPE,
                                  nullptr,
                                  0,
                                  nullptr,
                                  &variant_type);
  if (!check_odbc_error(ret)) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] d_variant failed to get variant type");
    return false;
  }
  // read this row by its own base type. the column stays SQL_SS_VARIANT, so every row is
  // resolved again: rows of one variant column can each hold a different type (#497)
  return dispatch(static_cast<SQLSMALLINT>(variant_type), row_id, column);
}

bool OdbcStatementLegacy::d_time(
    const size_t row_id, const size_t column) {  // NOLINT(bugprone-easily-swappable-parameters)
  const auto& statement = *_statement;
  SQLLEN str_len_or_ind_ptr = 0;
  SQL_SS_TIME2_STRUCT time = {};
  SQLLEN precision = 0;
  SQLLEN colscale = 0;
  const auto ret2 = _odbcApi->SQLColAttribute(
      statement.get_handle(), column + 1, SQL_COLUMN_PRECISION, nullptr, 0, nullptr, &precision);
  if (!check_odbc_error(ret2)) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString()
                             << "] d_variant failed to get col attribute precision");
    return false;
  }
  const auto ret3 = _odbcApi->SQLColAttribute(
      statement.get_handle(), column + 1, SQL_COLUMN_SCALE, nullptr, 0, nullptr, &colscale);
  if (!check_odbc_error(ret3)) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString()
                             << "] d_variant failed to get col attribute scale");
    return false;
  }
  const auto ret = _odbcApi->SQLGetData(statement.get_handle(),
                                        static_cast<SQLSMALLINT>(column + 1),
                                        SQL_C_BINARY,
                                        &time,
                                        sizeof(time),
                                        &str_len_or_ind_ptr);

  if (!check_odbc_error(ret)) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] d_variant failed to get data");
    return false;
  }

  if (str_len_or_ind_ptr == SQL_NULL_DATA) {
    _resultset->add_column(row_id, make_shared<NullColumn>(column));
    return true;
  }

  SQL_SS_TIMESTAMPOFFSET_STRUCT datetime = {};
  datetime.year = JS_DEFAULT_YEAR;
  datetime.month = SQL_SERVER_DEFAULT_MONTH;
  datetime.day = SQL_SERVER_DEFAULT_DAY;
  datetime.hour = time.hour;
  datetime.minute = time.minute;
  datetime.second = time.second;
  datetime.fraction = time.fraction;

  _resultset->add_column(row_id, make_shared<TimestampColumn>(column, datetime));
  return true;
}

bool OdbcStatementLegacy::get_data_timestamp_offset(
    const size_t row_id, const size_t column) {  // NOLINT(bugprone-easily-swappable-parameters)
  const auto& statement = *_statement;
  const auto storage = make_shared<DatumStorageLegacy>();
  storage->ReserveTimestampOffset(1);
  SQLLEN str_len_or_ind_ptr = 0;

  const auto ret = _odbcApi->SQLGetData(statement.get_handle(),
                                        static_cast<SQLSMALLINT>(column + 1),
                                        SQL_C_DEFAULT,
                                        storage->timestampoffsetvec_ptr->data(),
                                        sizeof(SQL_SS_TIMESTAMPOFFSET_STRUCT),
                                        &str_len_or_ind_ptr);
  if (!check_odbc_error(ret)) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString()
                             << "] get_data_timestamp_offset failed to get data");
    return false;
  }
  if (str_len_or_ind_ptr == SQL_NULL_DATA) {
    _resultset->add_column(row_id, make_shared<NullColumn>(column));
    return true;  // break
  }
  _resultset->add_column(row_id, make_shared<TimestampColumn>(column, storage));
  return true;
}

bool OdbcStatementLegacy::get_data_timestamp(
    const size_t row_id, const size_t column) {  // NOLINT(bugprone-easily-swappable-parameters)
  const auto& statement = *_statement;
  SQLLEN str_len_or_ind_ptr = 0;
  TIMESTAMP_STRUCT v;
  const auto ret = _odbcApi->SQLGetData(statement.get_handle(),
                                        static_cast<SQLSMALLINT>(column + 1),
                                        SQL_C_TIMESTAMP,
                                        &v,
                                        sizeof(TIMESTAMP_STRUCT),
                                        &str_len_or_ind_ptr);
  if (!check_odbc_error(ret)) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] get_data_timestamp failed to get data");
    return false;
  }
  if (str_len_or_ind_ptr == SQL_NULL_DATA) {
    _resultset->add_column(row_id, make_shared<NullColumn>(column));
    return true;  // break
  }
  _resultset->add_column(row_id, make_shared<TimestampColumn>(column, v));
  return true;
}

bool OdbcStatementLegacy::get_data_big_int(
    const size_t row_id, const size_t column) {  // NOLINT(bugprone-easily-swappable-parameters)
  const auto& statement = *_statement;
  DatumStorageLegacy::bigint_t v = 0;
  SQLLEN str_len_or_ind_ptr = 0;
  const auto ret = _odbcApi->SQLGetData(statement.get_handle(),
                                        static_cast<SQLSMALLINT>(column + 1),
                                        SQL_C_SBIGINT,
                                        &v,
                                        sizeof(DatumStorageLegacy::bigint_t),
                                        &str_len_or_ind_ptr);
  if (!check_odbc_error(ret)) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] get_data_big_int failed to get data");
    return false;
  }
  if (str_len_or_ind_ptr == SQL_NULL_DATA) {
    _resultset->add_column(row_id, make_shared<NullColumn>(column));
    return true;
  }
  const auto col = make_shared<BigIntColumn>(column, v);
  if (_numericStringEnabled) {
    col->AsString();
  } else if (_bigIntAsNativeEnabled) {
    col->AsBigInt();
  }
  _resultset->add_column(row_id, col);
  return true;
}

bool OdbcStatementLegacy::get_data_tiny(
    const size_t row_id, const size_t column) {  // NOLINT(bugprone-easily-swappable-parameters)
  const auto& statement = *_statement;

  int8_t v = 0;
  SQLLEN str_len_or_ind_ptr = 0;
  const auto ret = _odbcApi->SQLGetData(statement.get_handle(),
                                        static_cast<SQLSMALLINT>(column + 1),
                                        SQL_C_TINYINT,
                                        &v,
                                        sizeof(int8_t),
                                        &str_len_or_ind_ptr);
  if (!check_odbc_error(ret)) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] get_data_tiny failed to get data");
    return false;
  }
  if (str_len_or_ind_ptr == SQL_NULL_DATA) {
    _resultset->add_column(row_id, make_shared<NullColumn>(column));
    return true;
  }
  SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] get_data_tiny: value read = " << v);
  const auto col = make_shared<IntColumn>(column, v);
  if (_numericStringEnabled) {
    col->AsString();
  }
  _resultset->add_column(row_id, col);
  return true;
}

bool OdbcStatementLegacy::get_data_long(const size_t row_id, const size_t column) {
  const auto& statement = *_statement;

  int32_t v = 0;
  SQLLEN str_len_or_ind_ptr = 0;
  const auto ret = _odbcApi->SQLGetData(statement.get_handle(),
                                        static_cast<SQLSMALLINT>(column + 1),
                                        SQL_C_SLONG,
                                        &v,
                                        sizeof(int32_t),
                                        &str_len_or_ind_ptr);
  if (!check_odbc_error(ret)) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] get_data_long failed to get data");
    return false;
  }
  if (str_len_or_ind_ptr == SQL_NULL_DATA) {
    _resultset->add_column(row_id, make_shared<NullColumn>(column));
    return true;
  }
  SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] get_data_long: value read = " << v);
  const auto col = make_shared<IntColumn>(column, v);
  if (_numericStringEnabled) {
    col->AsString();
  }
  _resultset->add_column(row_id, col);
  return true;
}

bool OdbcStatementLegacy::get_data_bit(const size_t row_id, const size_t column) {
  const auto& statement = *_statement;
  char v = 0;
  SQLLEN str_len_or_ind_ptr = 0;
  const auto ret = _odbcApi->SQLGetData(statement.get_handle(),
                                        static_cast<SQLSMALLINT>(column + 1),
                                        SQL_C_BIT,
                                        &v,
                                        sizeof(char),
                                        &str_len_or_ind_ptr);
  if (!check_odbc_error(ret)) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] get_data_bit failed to get data");
    return false;
  }
  if (str_len_or_ind_ptr == SQL_NULL_DATA) {
    _resultset->add_column(row_id, make_shared<NullColumn>(column));
    return true;
  }
  _resultset->add_column(row_id, make_shared<BoolColumn>(column, v));
  return true;
}

bool OdbcStatementLegacy::get_data_numeric(
    const size_t row_id, const size_t column) {  // NOLINT(bugprone-easily-swappable-parameters)
  const auto& statement = *_statement;
  SQLLEN str_len_or_ind_ptr = 0;
  SQL_NUMERIC_STRUCT v;
  const auto ret = _odbcApi->SQLGetData(statement.get_handle(),
                                        static_cast<SQLSMALLINT>(column + 1),
                                        SQL_C_NUMERIC,
                                        &v,
                                        sizeof(SQL_NUMERIC_STRUCT),
                                        &str_len_or_ind_ptr);
  if (!check_odbc_error(ret)) {
    SQL_LOG_DEBUG_STREAM("get_data_numeric failed to get data");
    return false;
  }
  if (str_len_or_ind_ptr == SQL_NULL_DATA) {
    _resultset->add_column(row_id, make_shared<NullColumn>(column));
    return true;
  }

  const auto x = NumericUtils::decode_numeric_struct(v);
  if (trunc(x) == x) {
    auto bi = static_cast<DatumStorageLegacy::bigint_t>(x);
    const auto col = make_shared<BigIntColumn>(column, bi);
    if (_numericStringEnabled) {
      col->AsString();
    }
    _resultset->add_column(row_id, col);
  } else {
    const auto col = make_shared<NumberColumn>(column, static_cast<double>(x));
    if (_numericStringEnabled) {
      col->AsString();
    }
    _resultset->add_column(row_id, col);
  }

  return true;
}

bool OdbcStatementLegacy::get_data_decimal(const size_t row_id, const size_t column) {
  const auto& statement = *_statement;
  SQLLEN str_len_or_ind_ptr = 0;
  double v = NAN;
  const auto ret = _odbcApi->SQLGetData(statement.get_handle(),
                                        static_cast<SQLSMALLINT>(column + 1),
                                        SQL_C_DOUBLE,
                                        &v,
                                        sizeof(double),
                                        &str_len_or_ind_ptr);
  if (!check_odbc_error(ret)) {
    SQL_LOG_DEBUG_STREAM("get_data_decimal failed to get data");
    return false;
  }
  if (str_len_or_ind_ptr == SQL_NULL_DATA) {
    _resultset->add_column(row_id, make_shared<NullColumn>(column));
    return true;
  }

  const auto v2 = trunc(v);
  // the bounds are exact as doubles: INT64_MAX is not, and rounds up to 2^63, which does not
  // fit in an int64 (bigint max read as a double came back as INT64_MIN)
  if (v2 == v && v2 >= -9223372036854775808.0 && v2 < 9223372036854775808.0) {
    auto bi = static_cast<DatumStorageLegacy::bigint_t>(v);
    const auto col = make_shared<BigIntColumn>(column, bi);
    if (_numericStringEnabled) {
      col->AsString();
    }
    _resultset->add_column(row_id, col);
  } else {
    const auto col = make_shared<NumberColumn>(column, v);
    if (_numericStringEnabled) {
      col->AsString();
    }
    _resultset->add_column(row_id, col);
  }

  return true;
}

// a numeric or decimal as the driver's text, which keeps every digit and the scale ("5.00").
// the driver leaves out the zero before the point ("-.50"); it is put back ("-0.50").
bool OdbcStatementLegacy::get_data_numeric_string(const size_t row_id, const size_t column) {
  // 38 digits, a sign and a point
  constexpr SQLLEN capacity = 64;
  constexpr auto unit = static_cast<SQLLEN>(sizeof(uint16_t));
  std::vector<uint16_t> text(capacity, 0);
  SQLLEN value_len = 0;
  const auto ret = _odbcApi->SQLGetData(_statement->get_handle(),
                                        static_cast<SQLSMALLINT>(column + 1),
                                        SQL_C_WCHAR,
                                        text.data(),
                                        capacity * unit,
                                        &value_len);
  if (!check_odbc_error(ret)) {
    SQL_LOG_DEBUG_STREAM("get_data_numeric_string failed to get data");
    return false;
  }
  if (value_len == SQL_NULL_DATA) {
    _resultset->add_column(row_id, make_shared<NullColumn>(column));
    return true;
  }
  auto len = static_cast<size_t>(value_len / unit);
  if (len >= static_cast<size_t>(capacity)) {
    len = static_cast<size_t>(capacity) - 1;
  }
  text.resize(len);
  add_leading_zero(text);
  const auto size = text.size();
  const auto storage = make_shared<std::vector<uint16_t>>(std::move(text));
  _resultset->add_column(row_id, make_shared<StringColumn>(column, storage, 0, size));
  return true;
}
}  // namespace mssql
