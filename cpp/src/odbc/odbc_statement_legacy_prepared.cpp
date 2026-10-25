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

bool OdbcStatementLegacy::BindExecute(const std::shared_ptr<BoundDatumSet> parameters,
                                      std::shared_ptr<QueryResult>& result) {
  SQL_LOG_FUNC_TRACER();
  lock_guard<recursive_mutex> lock(g_i_mutex);
  SQL_LOG_DEBUG_STREAM("OdbcStatementLegacy::BindExecute [" << _handle.toString()
                                                            << "] Enter BindExecute");
  if (!_prepared || !_resultset) {
    // a statement whose prepare failed has no result storage to execute into: refuse it
    // rather than execute and read through it
    _errors->clear();
    _errorHandler->ClearErrors();
    const auto error = make_shared<OdbcError>(
        "HY010", "[msnodesql] statement has not been prepared", 0, 0, "", "", 0);
    _errors->push_back(error);
    _errorHandler->AddError(error);
    set_state(OdbcStatementState::STATEMENT_ERROR);
    assign_result(result, _resultset);
    return false;
  }
  auto res = bind_fetch(parameters);
  assign_result(result, _resultset);
  SQL_LOG_DEBUG_STREAM("OdbcStatementLegacy::BindExecute [" << _handle.toString()
                                                            << "] Exit BindExecute");
  return res;
}

bool OdbcStatementLegacy::Prepare(const std::shared_ptr<BoundDatumSet> parameters,
                                  std::shared_ptr<QueryResult>& result) {
  SQL_LOG_FUNC_TRACER();
  lock_guard<recursive_mutex> lock(g_i_mutex);
  SQL_LOG_DEBUG_STREAM("OdbcStatementLegacy::Prepare [" << _handle.toString() << "] Enter Prepare");
  auto res = try_prepare(_operationParams);
  if (res) {
    assign_result(result, _resultset);
  }
  SQL_LOG_DEBUG_STREAM("OdbcStatementLegacy::Prepare [" << _handle.toString() << "] Exit Execute");
  return res;
}

bool OdbcStatementLegacy::prepared_read() {
  if (!_statement)
    return false;
  // fprintf(stderr, "prepared_read");
  const auto& statement = *_statement;
  _odbcApi->SQLSetStmtAttrW(
      statement.get_handle(), SQL_ATTR_ROWS_FETCHED_PTR, &_resultset->_row_count, 0);

  const auto ret = _odbcApi->SQLFetchScroll(statement.get_handle(), SQL_FETCH_NEXT, 0);
  // cerr << " row_count " << row_count << endl;
  if (ret == SQL_NO_DATA) {
    keep_diagnostics();
    _resultset->_end_of_rows = true;
    return true;
  }
  _resultset->_end_of_rows = false;
  auto res = true;
  if (!check_odbc_error(ret))
    return false;
  if (ret == SQL_SUCCESS_WITH_INFO) {
    keep_diagnostics();
  }
  const auto column_count = static_cast<int>(_resultset->get_column_count());
  for (auto c = 0; c < column_count; ++c) {
    const auto& definition = _resultset->get_meta_data(c);
    // having bound a block, will collect 50 rows worth of data in 1 call.
    res = dispatch_prepared(definition.dataType, definition.columnSize, _resultset->_row_count, c);
    if (!res) {
      res = false;
      break;
    }
  }
  return res;
}

bool OdbcStatementLegacy::try_prepare(const shared_ptr<QueryOperationParams>& q) {
  if (!_statement)
    return false;
  const auto& statement = *_statement;
  _query = q;
  auto query = q->query_string;

  auto ret = _odbcApi->SQLPrepare(
      statement.get_handle(), reinterpret_cast<SQLWCHAR*>(query.data()), query.size());
  if (!check_odbc_error(ret)) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] try_prepare failed to prepare");
    return false;
  }

  _preparedStorage = make_shared<BoundDatumSet>(q);
  _describeAtExecute = false;
  _boundToFirstResult = true;
  if (!bind_prepared_columns()) {
    if (!describe_deferred()) {
      return false;
    }
    // the server cannot say yet what the result will be: bound at each execution
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] try_prepare: result described at execute");
    _errors->clear();
    _errorHandler->ClearErrors();
    _describeAtExecute = true;
    _resultset = make_unique<ResultSet>(0);
  } else if (_resultset->get_column_count() == 0) {
    // no columns: a statement with no result, or one the driver does not describe before it
    // runs (with column encryption enabled, say). described again once it has run
    _describeAtExecute = true;
  }

  _resultset->_end_of_rows = true;
  _prepared = true;

  set_state(OdbcStatementState::STATEMENT_PREPARED);

  return true;
}

// the result's columns: described, storage reserved for a block of rows, and bound
bool OdbcStatementLegacy::bind_prepared_columns() {
  const auto& statement = *_statement;
  SQLSMALLINT num_cols = 0;
  auto ret = _odbcApi->SQLNumResultCols(statement.get_handle(), &num_cols);
  if (!check_odbc_error(ret)) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString()
                             << "] bind_prepared_columns failed to get num result cols");
    return false;
  }

  _resultset = make_unique<ResultSet>(num_cols);

  for (auto i = 0; i < num_cols; i++) {
    if (!read_next(i)) {
      return false;
    }
  }
  return bind_prepared_storage();
}

// storage for a block of rows of the result described in _resultset, bound to its columns
bool OdbcStatementLegacy::bind_prepared_storage() {
  const auto& statement = *_statement;
  // release the columns bound for the last result before their storage goes
  const auto bound = _preparedStorage ? _preparedStorage->size() : 0;
  for (size_t c = 0; c < bound; ++c) {
    _odbcApi->SQLBindCol(
        statement.get_handle(), static_cast<SQLUSMALLINT>(c + 1), SQL_C_DEFAULT, nullptr, 0, nullptr);
  }
  _preparedStorage = make_shared<BoundDatumSet>(_query);

  auto ret = _odbcApi->SQLSetStmtAttr(statement.get_handle(),
                                 SQL_ATTR_ROW_ARRAY_SIZE,
                                 reinterpret_cast<SQLPOINTER>(prepared_rows_to_bind),
                                 0);
  _preparedStorage->reserve(_resultset->get_metadata(), prepared_rows_to_bind);

  auto i = 0;
  for (const auto& datum : *_preparedStorage) {
    ret = _odbcApi->SQLBindCol(statement.get_handle(),
                               static_cast<SQLUSMALLINT>(i + 1),
                               datum->c_type,
                               datum->buffer,
                               datum->buffer_len,
                               datum->get_ind_vec().data());
    if (!check_odbc_error(ret)) {
      SQL_LOG_DEBUG_STREAM("[" << _handle.toString()
                               << "] bind_prepared_columns failed to bind col");
      return false;
    }
    ++i;
  }
  return true;
}

// the describe at prepare failed only because the server cannot know the result before the
// statement runs: "the metadata could not be determined" (11500 - 11599, e.g. 11521 a
// parameter decides a column's type, 11525 a temp table in a batch), perhaps with 8180
// "statement(s) could not be prepared". any other error is the prepare's own
bool OdbcStatementLegacy::describe_deferred() const {
  auto deferred = false;
  for (const auto& e : *_errors) {
    const auto code = e->code;
    if (code >= 11500 && code < 11600) {
      deferred = true;
    } else if (code != 8180) {
      return false;
    }
  }
  return deferred;
}

bool OdbcStatementLegacy::bind_fetch(const shared_ptr<BoundDatumSet>& param_set) {
  if (!_statement)
    return false;
  const auto& statement = *_statement;
  // each execution starts clean: the errors of the last one are not this one's, and a
  // cursor it left open (it failed part way through its rows, say) is closed - else this
  // execute fails with 24000 invalid cursor state. with no cursor open, SQLCloseCursor
  // fails harmlessly (24000), and SQLExecute clears its diagnostics.
  _errors->clear();
  _errorHandler->ClearErrors();
  _odbcApi->SQLCloseCursor(statement.get_handle());
  const bool polling_mode = get_polling();
  const auto bound = bind_params(param_set);
  if (!bound) {
    // error already set in BindParams
    return false;
  }
  if (polling_mode) {
    const auto s = _odbcApi->SQLSetStmtAttr(statement.get_handle(),
                                            SQL_ATTR_ASYNC_ENABLE,
                                            reinterpret_cast<SQLPOINTER>(SQL_ASYNC_ENABLE_ON),
                                            0);
    if (!check_odbc_error(s)) {
      SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] bind_fetch failed to set stmt attr");
      return false;
    }
  }

  set_state(OdbcStatementState::STATEMENT_SUBMITTED);
  auto ret = _odbcApi->SQLExecute(statement.get_handle());
  if (polling_mode) {
    const auto vec = make_shared<vector<uint16_t>>();
    ret = poll_check(ret, vec, false);
  }
  const auto state = get_state();
  if (state == OdbcStatementState::STATEMENT_CANCELLED) {
    return raise_cancel();
  }

  if (ret == SQL_NO_DATA) {
    _resultset = make_unique<ResultSet>(0);
    _resultset->_end_of_rows = true;
    return true;
  }

  if (!check_odbc_error(ret)) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] bind_fetch failed to execute");
    return false;
  }
  if (ret == SQL_SUCCESS_WITH_INFO) {
    // read before describing the result clears them
    keep_diagnostics();
  }
  if (_describeAtExecute || !_boundToFirstResult) {
    // what this execution returns is known now that it has run, or the storage is still
    // bound to a later result of the last execution: bind its first result
    const auto kept = *_errors;
    if (!bind_prepared_columns()) {
      SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] bind_fetch failed to bind the result");
      return false;
    }
    *_errors = kept;
    _boundToFirstResult = true;
  }
  // this execution has its results still to read: the result set's end flags are the
  // last execution's (taken with info, they would say this one has nothing to read)
  _resultset->_end_of_rows = false;
  _resultset->_end_of_results = false;

  ret = _odbcApi->SQLRowCount(statement.get_handle(), &_resultset->_row_count);
  auto result = check_odbc_error(ret);
  if (!result) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] bind_fetch failed to get row count");
  }
  return result;
}

bool OdbcStatementLegacy::dispatch_prepared(
    const SQLSMALLINT t,
    const size_t column_size,
    const size_t rows_read,
    const size_t column) const {  // NOLINT(bugprone-easily-swappable-parameters)
  auto res = false;
  switch (t) {
    case SQL_SS_VARIANT:
      // res = d_variant(row_id, column);
      break;

    case SQL_CHAR:
    case SQL_VARCHAR:
      res = reserved_chars(rows_read, column_size, column);
      break;
      break;
    case SQL_LONGVARCHAR:
    case SQL_WCHAR:
    case SQL_WVARCHAR:
    case SQL_WLONGVARCHAR:
    case SQL_SS_XML:
    case SQL_GUID:
      res = reserved_string(rows_read, column_size, static_cast<int>(column));
      break;

    case SQL_BIT:
      res = reserved_bit(rows_read, column);
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
      res = reserved_int(rows_read, column);
      break;

    case SQL_BIGINT:
      res = reserved_big_int(rows_read, column);
      break;

    case SQL_DECIMAL:
    case SQL_NUMERIC:
      // bound as text at prepare when numeric strings were on
      if (_preparedStorage->atIndex(static_cast<int>(column))->c_type == SQL_C_WCHAR) {
        res = reserved_numeric_text(rows_read, column);
      } else {
        res = reserved_decimal(rows_read, column);
      }
      break;

    case SQL_REAL:
    case SQL_FLOAT:
    case SQL_DOUBLE:
      res = reserved_decimal(rows_read, column);
      break;

    case SQL_BINARY:
    case SQL_VARBINARY:
    case SQL_LONGVARBINARY:
    case SQL_SS_UDT:
      res = reserved_binary(rows_read, column_size, static_cast<int>(column));
      break;

    case SQL_SS_TIMESTAMPOFFSET:
      res = reserved_timestamp_offset(rows_read, column);
      break;

    case SQL_TYPE_TIME:
    case SQL_SS_TIME2:
      res = reserved_time(rows_read, column);
      break;

    case SQL_TIMESTAMP:
    case SQL_DATETIME:
    case SQL_TYPE_TIMESTAMP:
    case SQL_TYPE_DATE:
      res = reserved_timestamp(rows_read, column);
      break;

    default:
      res = reserved_string(rows_read, column_size, static_cast<int>(column));
      break;
  }

  return res;
}

bool OdbcStatementLegacy::reserved_bit(const size_t row_count, const size_t column) const {
  const auto& bound_datum = _preparedStorage->atIndex(static_cast<int>(column));
  const auto& ind = bound_datum->get_ind_vec();
  const auto storage = bound_datum->get_storage();
  for (size_t row_id = 0; row_id < row_count; ++row_id) {
    const auto str_len_or_ind_ptr = ind[row_id];
    if (str_len_or_ind_ptr == SQL_NULL_DATA) {
      _resultset->add_column(row_id, make_shared<NullColumn>(column));
      continue;
    }
    auto v = (*storage->charvec_ptr)[row_id];
    _resultset->add_column(row_id, make_shared<BoolColumn>(column, v));
  }
  return true;
}

bool OdbcStatementLegacy::reserved_big_int(const size_t row_count, const size_t column) const {
  const auto& bound_datum = _preparedStorage->atIndex(static_cast<int>(column));
  const auto& ind = bound_datum->get_ind_vec();
  const auto storage = bound_datum->get_storage();
  for (size_t row_id = 0; row_id < row_count; ++row_id) {
    auto v = (*storage->bigint_vec_ptr)[row_id];
    const auto str_len_or_ind_ptr = ind[row_id];
    if (str_len_or_ind_ptr == SQL_NULL_DATA) {
      _resultset->add_column(row_id, make_shared<NullColumn>(column));
      continue;
    }
    auto col = make_shared<BigIntColumn>(column, v);
    if (_numericStringEnabled) {
      col->AsString();
    } else if (_bigIntAsNativeEnabled) {
      col->AsBigInt();
    }
    _resultset->add_column(row_id, col);
  }
  return true;
}

bool OdbcStatementLegacy::reserved_int(const size_t row_count, const size_t column) const {
  const auto& bound_datum = _preparedStorage->atIndex(static_cast<int>(column));
  const auto& ind = bound_datum->get_ind_vec();
  const auto storage = bound_datum->get_storage();
  for (size_t row_id = 0; row_id < row_count; ++row_id) {
    auto v = (*storage->int64vec_ptr)[row_id];
    const auto str_len_or_ind_ptr = ind[row_id];
    if (str_len_or_ind_ptr == SQL_NULL_DATA) {
      _resultset->add_column(row_id, make_shared<NullColumn>(column));
      continue;
    }
    auto col = make_shared<IntColumn>(column, v);
    if (_numericStringEnabled) {
      col->AsString();
    }
    _resultset->add_column(row_id, col);
  }
  return true;
}

bool OdbcStatementLegacy::reserved_decimal(const size_t row_count, const size_t column) const {
  const auto& bound_datum = _preparedStorage->atIndex(static_cast<int>(column));
  const auto& ind = bound_datum->get_ind_vec();
  const auto storage = bound_datum->get_storage();
  for (size_t row_id = 0; row_id < row_count; ++row_id) {
    auto v = (*storage->doublevec_ptr)[row_id];
    const auto str_len_or_ind_ptr = ind[row_id];
    if (str_len_or_ind_ptr == SQL_NULL_DATA) {
      _resultset->add_column(row_id, make_shared<NullColumn>(column));
      continue;
    }
    const auto v2 = trunc(v);
    if (v2 == v &&
        v2 >= static_cast<long double>(numeric_limits<DatumStorageLegacy::bigint_t>::min()) &&
        v2 <= static_cast<long double>(numeric_limits<DatumStorageLegacy::bigint_t>::max())) {
      auto bi = static_cast<DatumStorageLegacy::bigint_t>(v);
      auto col = make_shared<BigIntColumn>(column, bi);
      if (_numericStringEnabled) {
        col->AsString();
      }
      _resultset->add_column(row_id, col);
    } else {
      auto col = make_shared<NumberColumn>(column, v);
      if (_numericStringEnabled) {
        col->AsString();
      }
      _resultset->add_column(row_id, col);
    }
  }
  return true;
}

bool OdbcStatementLegacy::reserved_timestamp(const size_t row_count, const size_t column) const {
  const auto& bound_datum = _preparedStorage->atIndex(static_cast<int>(column));
  const auto& ind = bound_datum->get_ind_vec();
  const auto storage = bound_datum->get_storage();
  for (size_t row_id = 0; row_id < row_count; ++row_id) {
    auto v = (*storage->timestampvec_ptr)[row_id];
    const auto str_len_or_ind_ptr = ind[row_id];
    if (str_len_or_ind_ptr == SQL_NULL_DATA) {
      _resultset->add_column(row_id, make_shared<NullColumn>(column));
      continue;
    }
    _resultset->add_column(row_id, make_shared<TimestampColumn>(column, v));
  }
  return true;
}

bool OdbcStatementLegacy::reserved_timestamp_offset(const size_t row_count,
                                                    const size_t column) const {
  const auto& bound_datum = _preparedStorage->atIndex(static_cast<int>(column));
  const auto& ind = bound_datum->get_ind_vec();
  const auto storage = bound_datum->get_storage();
  for (size_t row_id = 0; row_id < row_count; ++row_id) {
    auto v = (*storage->timestampoffsetvec_ptr)[row_id];
    const auto str_len_or_ind_ptr = ind[row_id];
    if (str_len_or_ind_ptr == SQL_NULL_DATA) {
      _resultset->add_column(row_id, make_shared<NullColumn>(column));
      continue;
    }
    _resultset->add_column(row_id, make_shared<TimestampColumn>(column, v));
  }
  return true;
}

bool OdbcStatementLegacy::reserved_time(const size_t row_count, const size_t column) const {
  const auto& bound_datum = _preparedStorage->atIndex(static_cast<int>(column));
  const auto& ind = bound_datum->get_ind_vec();
  const auto storage = bound_datum->get_storage();
  for (size_t row_id = 0; row_id < row_count; ++row_id) {
    const auto& time = (*storage->time2vec_ptr)[row_id];
    const auto str_len_or_ind_ptr = ind[row_id];
    if (str_len_or_ind_ptr == SQL_NULL_DATA) {
      _resultset->add_column(row_id, make_shared<NullColumn>(column));
      continue;
    }

    SQL_SS_TIMESTAMPOFFSET_STRUCT datetime;
    datetime.year = JS_DEFAULT_YEAR;
    datetime.month = SQL_SERVER_DEFAULT_MONTH;
    datetime.day = SQL_SERVER_DEFAULT_DAY;
    datetime.hour = time.hour;
    datetime.minute = time.minute;
    datetime.second = time.second;
    datetime.fraction = time.fraction * 100;

    _resultset->add_column(row_id, make_shared<TimestampColumn>(column, datetime));
  }
  return true;
}

// a prepared numeric or decimal column bound as text (numeric strings at prepare). an
// execution with numeric strings off reads the same text back as a number.
bool OdbcStatementLegacy::reserved_numeric_text(const size_t row_count, const size_t column) const {
  const auto& bound_datum = _preparedStorage->atIndex(static_cast<int>(column));
  const auto& ind = bound_datum->get_ind_vec();
  const auto& store = *bound_datum->get_storage()->uint16vec_ptr;
  constexpr auto unit = sizeof(uint16_t);
  for (size_t row_id = 0; row_id < row_count; ++row_id) {
    if (ind[row_id] == SQL_NULL_DATA) {
      _resultset->add_column(row_id, make_shared<NullColumn>(column));
      continue;
    }
    const auto offset = BoundDatum::numeric_text_width * row_id;
    const auto len = min(static_cast<size_t>(ind[row_id]) / unit, BoundDatum::numeric_text_width - 1);
    std::vector<uint16_t> text(store.begin() + static_cast<std::ptrdiff_t>(offset),
                               store.begin() + static_cast<std::ptrdiff_t>(offset + len));
    add_leading_zero(text);
    if (_numericStringEnabled) {
      const auto size = text.size();
      const auto storage = make_shared<std::vector<uint16_t>>(std::move(text));
      _resultset->add_column(row_id, make_shared<StringColumn>(column, storage, 0, size));
    } else {
      const std::string narrow(text.begin(), text.end());
      _resultset->add_column(row_id, make_shared<NumberColumn>(column, std::strtod(narrow.c_str(), nullptr)));
    }
  }
  return true;
}

bool OdbcStatementLegacy::reserved_chars(const size_t row_count,
                                         const size_t column_size,
                                         const size_t column) const {
  const auto& bound_datum = _preparedStorage->atIndex(static_cast<int>(column));
  const auto& ind = bound_datum->get_ind_vec();
  const auto storage = bound_datum->get_storage();
  for (size_t row_id = 0; row_id < row_count; ++row_id) {
    constexpr auto size = sizeof(uint8_t);
    const auto str_len_or_ind_ptr = ind[row_id];
    if (str_len_or_ind_ptr == SQL_NULL_DATA) {
      _resultset->add_column(row_id, make_shared<NullColumn>(column));
      continue;
    }
    auto offset = (column_size + 1) * row_id;
    const auto u8_store = storage->charvec_ptr;
    size_t actual_size = str_len_or_ind_ptr / size;
    auto to_read = column_size > 0 ? min(actual_size, column_size) : actual_size;
    if (actual_size + offset > u8_store->capacity()) {
      u8_store->reserve(actual_size + offset);
    }
    const auto value = make_shared<CharColumn>(column, u8_store, offset, to_read);
    _resultset->add_column(row_id, value);
  }
  return true;
}

bool OdbcStatementLegacy::reserved_string(const size_t row_count,
                                          const size_t column_size,
                                          const int column) const {
  const auto& bound_datum = _preparedStorage->atIndex(static_cast<int>(column));
  const auto& ind = bound_datum->get_ind_vec();
  const auto storage = bound_datum->get_storage();
  for (size_t row_id = 0; row_id < row_count; ++row_id) {
    constexpr auto size = sizeof(uint16_t);
    const auto str_len_or_ind_ptr = ind[row_id];
    if (str_len_or_ind_ptr == SQL_NULL_DATA) {
      _resultset->add_column(row_id, make_shared<NullColumn>(column));
      continue;
    }
    auto offset = (column_size + 1) * row_id;
    size_t actual_size = ind[row_id] / size;
    const auto uint16_store = storage->uint16vec_ptr;
    // Exclude null terminator from the size passed to JavaScript
    if (actual_size > 0 && uint16_store->at(offset + actual_size - 1) == 0) {
      actual_size--;
    }
    if (actual_size > uint16_store->capacity()) {
      uint16_store->reserve(actual_size);
    }
    auto to_read = column_size > 0 ? min(actual_size, column_size) : actual_size;
    const auto value = make_shared<StringColumn>(column, uint16_store, offset, to_read);
    _resultset->add_column(row_id, value);
  }
  return true;
}

bool OdbcStatementLegacy::reserved_binary(const size_t row_count,
                                          const size_t column_size,
                                          const int column) const {
  const auto& bound_datum = _preparedStorage->atIndex(static_cast<int>(column));
  auto& ind = bound_datum->get_ind_vec();
  const auto storage = bound_datum->get_storage();
  const auto uint8_store = storage->charvec_ptr;
  for (size_t row_id = 0; row_id < row_count; ++row_id) {
    const auto str_len_or_ind_ptr = ind[row_id];
    if (str_len_or_ind_ptr == SQL_NULL_DATA) {
      _resultset->add_column(row_id, make_shared<NullColumn>(column));
      continue;
    }
    auto offset = column_size * row_id;
    if (str_len_or_ind_ptr + offset > uint8_store->capacity()) {
      uint8_store->reserve(str_len_or_ind_ptr + offset);
    }
    const auto value = make_shared<BinaryColumn>(column, storage, offset, str_len_or_ind_ptr);
    _resultset->add_column(row_id, value);
  }
  return true;
}
}  // namespace mssql
