#include <platform.h>

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
const int SQL_SERVER_MAX_STRING_SIZE = 8000;

// default size to retrieve from a LOB field and we don't know the size
const int LOB_PACKET_SIZE = 8192;

namespace mssql {

size_t get_size(BoundDatumSet& params) {
  const auto f = params.begin();
  if (f == params.end())
    return 0;
  const auto p = *f;
  if (p->is_tvp) {
    // return p->param_size;
  }
  const auto size = p->get_ind_vec().size();
  return size;
}

OdbcStatementLegacy::~OdbcStatementLegacy() {
  // cerr << "~OdbcStatement() " << _statementId << " " << endl;
  if (get_state() == OdbcStatementState::STATEMENT_CLOSED) {
    set_state(OdbcStatementState::STATEMENT_CLOSED);
  }
}

OdbcStatementLegacy::OdbcStatementLegacy(std::shared_ptr<IOdbcStatementHandle> statement,
                                         std::shared_ptr<OdbcErrorHandler> errorHandler,
                                         std::shared_ptr<IOdbcApi> odbcApi,
                                         StatementHandle handle)
    : _endOfResults(true),
      _prepared(false),
      _cancelRequested(false),
      _pollingEnabled(false),
      _numericStringEnabled(false),
      _resultset(nullptr),
      _boundParamsSet(nullptr),
      _statement(statement),
      _errorHandler(errorHandler),
      _odbcApi(odbcApi),
      _handle(handle) {
  // cerr << "OdbcStatement() " << _statementId << " " << endl;
  // fprintf(stderr, "OdbcStatement::OdbcStatement OdbcStatement ID = %ld\n ", statement_id);

  _errors = make_shared<vector<shared_ptr<OdbcError>>>();
}

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
    const auto ret = SQLFetch(statement.get_handle());
    if (ret == SQL_NO_DATA) {
      // fprintf(stderr, "fetch_read SQL_NO_DATA\n");
      _resultset->_end_of_rows = true;
      return true;
    }
    if (!check_odbc_error(ret)) {
      // fprintf(stderr, "fetch_read check_odbc_error\n");
      return false;
    }
    _resultset->_end_of_rows = false;
    res = true;

    // fprintf(stderr, "column_count %d\n", _resultset->get_column_count());
    const auto column_count = static_cast<int>(_resultset->get_column_count());
    for (auto c = 0; c < column_count; ++c) {
      const auto& definition = _resultset->get_meta_data(c);
      res = dispatch(definition.dataType, row_id, c);
      if (!res) {
        break;
      }
    }
  }
  return res;
}

bool OdbcStatementLegacy::prepared_read() {
  if (!_statement)
    return false;
  // fprintf(stderr, "prepared_read");
  const auto& statement = *_statement;
  SQLSetStmtAttr(statement.get_handle(), SQL_ATTR_ROWS_FETCHED_PTR, &_resultset->_row_count, 0);

  const auto ret = SQLFetchScroll(statement.get_handle(), SQL_FETCH_NEXT, 0);
  // cerr << " row_count " << row_count << endl;
  if (ret == SQL_NO_DATA) {
    _resultset->_end_of_rows = true;
    return true;
  }
  _resultset->_end_of_rows = false;
  auto res = true;
  if (!check_odbc_error(ret))
    return false;
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

Napi::Object OdbcStatementLegacy::get_column_values(Napi::Env env) const {
  const auto result = Napi::Object::New(env);
  if (_resultset->EndOfRows()) {
    result.Set("end_rows", true);
  }
  // cerr << " get_column_values " << endl;
  const auto number_rows = _resultset->get_result_count();
  const auto column_count = static_cast<int>(_resultset->get_column_count());
  const auto results_array = Napi::Array::New(env, static_cast<int>(number_rows));
  const auto data = Napi::String::New(env, "data");
  result.Set(data, results_array);
  for (size_t row_id = 0; row_id < number_rows; ++row_id) {
    const auto row_array = Napi::Array::New(env, column_count);
    results_array.Set(row_id, row_array);
    for (auto c = 0; c < column_count; ++c) {
      row_array.Set(c, _resultset->get_column(row_id, c)->ToValue(env));
    }
  }

  return result;
}

bool OdbcStatementLegacy::apply_precision(const shared_ptr<BoundDatum>& datum,
                                          const int current_param) {
  /* Modify the fields in the implicit application parameter descriptor */
  SQLHDESC hdesc = nullptr;
  const SQLINTEGER bufferLength = 0;
  auto r = SQLGetStmtAttr(_statement->get_handle(), SQL_ATTR_APP_PARAM_DESC, &hdesc, 0, nullptr);
  if (!check_odbc_error(r)) {
    return false;
  }
  r = SQLSetDescField(hdesc,
                      current_param,
                      SQL_DESC_TYPE,
                      reinterpret_cast<SQLPOINTER>(datum->c_type),
                      bufferLength);
  if (!check_odbc_error(r)) {
    return false;
  }
  r = SQLSetDescField(hdesc,
                      current_param,
                      SQL_DESC_PRECISION,
                      reinterpret_cast<SQLPOINTER>(datum->param_size),
                      bufferLength);
  if (!check_odbc_error(r)) {
    return false;
  }
  r = SQLSetDescField(hdesc,
                      current_param,
                      SQL_DESC_SCALE,
                      reinterpret_cast<SQLPOINTER>(datum->digits),
                      bufferLength);
  if (!check_odbc_error(r)) {
    return false;
  }
  r = SQLSetDescField(hdesc,
                      current_param,
                      SQL_DESC_DATA_PTR,
                      static_cast<SQLPOINTER>(datum->buffer),
                      bufferLength);
  if (!check_odbc_error(r)) {
    return false;
  }
  return true;
}

// this will show on a different thread to the current executing query.
bool OdbcStatementLegacy::cancel() {
  {
    lock_guard<recursive_mutex> lock(g_i_mutex);
    const auto state = get_state();
    if (!_pollingEnabled && state == OdbcStatementState::STATEMENT_SUBMITTED) {
      set_state(OdbcStatementState::STATEMENT_CANCEL_HANDLE);
      // cerr << " cancel STATEMENT_CANCEL_HANDLE " << endl;
      cancel_handle();
      _resultset = make_unique<ResultSet>(0);
      _resultset->_end_of_rows = false;
      _endOfResults = false;
      return true;
    }
  }
  if (get_polling()) {
    _cancelRequested = true;
    return true;
  }
  SQLINTEGER native_error = -1;
  const auto* c_state = "CANCEL";
  const auto* c_msg =
      "Error: [msnodesql] cancel only supported for statements where polling is enabled.";
  _errors->push_back(make_shared<OdbcError>(c_state, c_msg, native_error, 0, "", "", 0));
  return false;
}

void OdbcStatementLegacy::set_state(const OdbcStatementState state) {
  lock_guard<recursive_mutex> lock(g_i_mutex);
  _statementState = state;
}

OdbcStatementLegacy::OdbcStatementState OdbcStatementLegacy::get_state() {
  lock_guard<recursive_mutex> lock(g_i_mutex);
  const auto state = _statementState;
  return state;
}

bool OdbcStatementLegacy::set_polling(const bool mode) {
  lock_guard<recursive_mutex> lock(g_i_mutex);
  if (_statementState == OdbcStatementState::STATEMENT_BINDING ||
      _statementState == OdbcStatementState::STATEMENT_SUBMITTED) {
    return true;
  }
  _pollingEnabled = mode;
  return true;
}

bool OdbcStatementLegacy::get_polling() {
  lock_guard<recursive_mutex> lock(g_i_mutex);
  const auto polling = _pollingEnabled;
  return polling;
}

bool OdbcStatementLegacy::set_numeric_string(const bool mode) {
  lock_guard<recursive_mutex> lock(g_i_mutex);
  _numericStringEnabled = mode;
  return true;
}

bool OdbcStatementLegacy::bind_tvp(vector<tvp_t>& tvps) {
  if (!_statement)
    return false;
  const auto& statement = *_statement;
  for (const auto& tvp : tvps) {
    auto tvpret = SQLSetStmtAttr(statement.get_handle(),
                                 SQL_SOPT_SS_PARAM_FOCUS,
                                 reinterpret_cast<SQLPOINTER>(static_cast<long long>(tvp.first)),
                                 SQL_IS_INTEGER);
    if (!check_odbc_error(tvpret)) {
      return false;
    }
    auto current_param = 1;
    const auto col_set = tvp.second;
    for (auto& col_itr : *col_set) {
      bind_datum(current_param, col_itr);
      current_param++;
    }
    tvpret = SQLSetStmtAttr(statement.get_handle(),
                            SQL_SOPT_SS_PARAM_FOCUS,
                            static_cast<SQLPOINTER>(nullptr),
                            SQL_IS_INTEGER);
    if (!check_odbc_error(tvpret)) {
      return false;
    }
  }
  return true;
}

bool OdbcStatementLegacy::bind_datum(const int current_param, const shared_ptr<BoundDatum>& datum) {
  if (!_statement)
    return false;
  const auto& statement = *_statement;

  auto r = SQLBindParameter(statement.get_handle(),
                            static_cast<SQLUSMALLINT>(current_param),
                            datum->param_type,
                            datum->c_type,
                            datum->sql_type,
                            datum->param_size,
                            datum->digits,
                            datum->buffer,
                            datum->buffer_len,
                            datum->get_ind_vec().data());

  if (!check_odbc_error(r)) {
    return false;
  }
  /*
  if (datum->is_money) {
    auto isSmallMoney = false;
    SQLHANDLE hdesc = nullptr;
    auto moneyType = isSmallMoney
    ? (SQLPOINTER)SQL_SS_TYPE_SMALLMONEY
    : (SQLPOINTER)SQL_SS_TYPE_MONEY;

    int   x = 0;
    r = SQLGetStmtAttr(statement.get_handle(), SQL_ATTR_APP_PARAM_DESC, &hdesc, 0, nullptr);

    r = SQLGetDescField( hdesc, current_param, SQL_DESC_PRECISION, (SQLPOINTER)&x, sizeof(x), 0);
    r = SQLGetDescField( hdesc, current_param, SQL_DESC_TYPE, (SQLPOINTER)&x, sizeof(x), 0);

    r = SQLSetDescField(hdesc, current_param,
    SQL_CA_SS_SERVER_TYPE,
    SQL_SS_TYPE_DEFAULT,
    SQL_IS_INTEGER);

    SQLGetStmtAttr(statement.get_handle(), SQL_ATTR_APP_PARAM_DESC, &hdesc, 0, NULL);
    SQLSetDescField(hdesc, current_param, SQL_DESC_PRECISION, (SQLPOINTER)(datum->param_size), 0);
    SQLSetDescField(hdesc, current_param, SQL_DESC_SCALE, (SQLPOINTER)(datum->digits), 0);
    SQLSetDescField(hdesc, current_param, SQL_DESC_DATA_PTR, &var, 0);
  }
  */
  if (datum->get_defined_precision()) {
    if (!apply_precision(datum, current_param)) {
      return false;
    }
  }
  const auto name = datum->name;
  if (!name.empty()) {
    SQLINTEGER string_length = 0;
    SQLHANDLE ipd = nullptr;
    auto* const name_ptr = const_cast<wchar_t*>(name.c_str());
    r = SQLGetStmtAttr(
        statement.get_handle(), SQL_ATTR_IMP_PARAM_DESC, &ipd, SQL_IS_POINTER, &string_length);
    if (!check_odbc_error(r))
      return false;
    SQLSetDescField(ipd, current_param, SQL_DESC_NAME, name_ptr, name.size() * sizeof(wchar_t));
    if (!check_odbc_error(r))
      return false;
  }

  return true;
}

void OdbcStatementLegacy::queue_tvp(int current_param,
                                    param_bindings::iterator& itr,
                                    shared_ptr<BoundDatum>& datum,
                                    vector<tvp_t>& tvps) {
  if (!_statement)
    return;
  SQLHANDLE ipd = nullptr;
  const auto& statement = *_statement;
  SQLINTEGER string_length = 0;
  auto r = SQLGetStmtAttr(
      statement.get_handle(), SQL_ATTR_IMP_PARAM_DESC, &ipd, SQL_IS_POINTER, &string_length);
  if (!check_odbc_error(r))
    return;
  const auto& schema = datum->get_storage()->schema;
  if (!schema.empty()) {
    auto schema_vec = odbcstr::wstr2wcvec(schema);
    r = SQLSetDescField(ipd,
                        current_param,
                        SQL_CA_SS_SCHEMA_NAME,
                        reinterpret_cast<SQLPOINTER>(schema_vec.data()),
                        schema_vec.size() * 2);
    if (!check_odbc_error(r))
      return;
  }
  tvp_t tvp;
  const auto cols = make_shared<BoundDatumSet::param_bindings>();
  for (auto c = 1; c <= datum->tvp_no_cols; ++c) {
    ++itr;
    const auto& col_datum = *itr;
    cols->push_back(col_datum);
  }
  tvps.emplace_back(current_param, cols);
}

// bind all the parameters in the array
bool OdbcStatementLegacy::bind_params(const shared_ptr<BoundDatumSet>& params) {
  if (!_statement)
    return false;
  auto& ps = *params;
  // fprintf(stderr, "bind_params\n");
  const auto size = get_size(ps);
  if (size <= 0)
    return true;
  const auto& statement = *_statement;
  if (size > 1) {
    const auto ret = SQLSetStmtAttr(
        statement.get_handle(), SQL_ATTR_PARAMSET_SIZE, reinterpret_cast<SQLPOINTER>(size), 0);
    if (!check_odbc_error(ret)) {
      return false;
    }
  }
  auto current_param = 1;

  vector<tvp_t> tvps;
  for (auto itr = ps.begin(); itr != ps.end(); ++itr) {
    auto& datum = *itr;
    if (!bind_datum(current_param, datum)) {
      return false;
    }
    if (datum->is_tvp) {
      queue_tvp(current_param, itr, datum, tvps);
    }
    ++current_param;
  }
  bind_tvp(tvps);

  return true;
}

Napi::Array OdbcStatementLegacy::unbind_params(Napi::Env env) const {
  if (_boundParamsSet != nullptr) {
    return _boundParamsSet->unbind(env);
  }
  return Napi::Array::New(env, 0);
}

Napi::Object OdbcStatementLegacy::get_meta_value(Napi::Env env) const {
  if (_cancelRequested || _resultset == nullptr) {
    return Napi::Object::New(env);
  }
  return _resultset->meta_to_value(env);
}

bool OdbcStatementLegacy::end_of_results() const {
  return _endOfResults;
}

Napi::Object OdbcStatementLegacy::handle_end_of_results(Napi::Env env) const {
  return Napi::Boolean::New(env, _endOfResults).As<Napi::Object>();
}

Napi::Object OdbcStatementLegacy::end_of_rows(Napi::Env env) const {
  return Napi::Boolean::New(env, _resultset->EndOfRows()).As<Napi::Object>();
}

bool OdbcStatementLegacy::return_odbc_error() {
  if (!_statement)
    return false;
  _statement->read_errors(_errors);
  return false;
}

bool OdbcStatementLegacy::check_odbc_error(const SQLRETURN ret) {
  if (!SQL_SUCCEEDED(ret)) {
    set_state(OdbcStatementState::STATEMENT_ERROR);
    return return_odbc_error();
  }
  return true;
}

bool OdbcStatementLegacy::read_col_attributes(ColumnDefinition& current, const int column) {
  constexpr size_t l = 1024;
  vector<SQLWCHAR> type_name(l);
  SQLSMALLINT type_name_len = 0;
  const auto index = column + 1;
  auto ret = SQLColAttribute(_statement->get_handle(),
                             index,
                             SQL_DESC_TYPE_NAME,
                             type_name.data(),
                             type_name.size(),
                             &type_name_len,
                             nullptr);
  if (!check_odbc_error(ret))
    return false;

  current.dataTypeName = odbcstr::swcvec2str(type_name, type_name_len);
  // wcerr << "type_name_len " << current.dataTypeName << endl;
  switch (current.dataType) {
    case SQL_SS_VARIANT: {
      // dispatch as variant type which reads underlying column type and re-reads correctly.
    } break;

    case SQL_SS_UDT: {
      vector<SQLWCHAR> udt_type_name(l);
      SQLSMALLINT udt_type_name_len = 0;
      ret = SQLColAttribute(_statement->get_handle(),
                            index,
                            SQL_CA_SS_UDT_TYPE_NAME,
                            udt_type_name.data(),
                            udt_type_name.size(),
                            &udt_type_name_len,
                            nullptr);
      if (!check_odbc_error(ret))
        return false;
      current.udtTypeName = odbcstr::swcvec2str(udt_type_name, udt_type_name_len);
    } break;

    default:
      break;
  }

  return true;
}

bool OdbcStatementLegacy::read_next(const int column) {
  if (!_statement)
    return false;
  const auto& statement = *_statement;
  SQLSMALLINT name_length = 1024;
  const auto index = column + 1;
  auto& current = _resultset->get_meta_data(column);
  const auto l = name_length + static_cast<SQLSMALLINT>(1);
  current.name.reserve(l);
  current.name.resize(l);
  auto ret = SQLDescribeCol(statement.get_handle(),
                            index,
                            current.name.data(),
                            current.name.size(),
                            &name_length,
                            &current.dataType,
                            &current.columnSize,
                            &current.decimalDigits,
                            &current.nullable);
  if (!check_odbc_error(ret))
    return false;
  current.name.resize(name_length);

  // wcerr << "read_next " << column << " name = " << current.name << endl;
  ret = read_col_attributes(current, column);
  if (!check_odbc_error(ret))
    return false;

  return ret;
}

bool OdbcStatementLegacy::start_reading_results() {
  if (!_statement)
    return false;

  if (_cancelRequested) {
    _resultset = make_unique<ResultSet>(0);
    return true;
  }

  SQLSMALLINT columns = 0;
  const auto& statement = *_statement;
  auto ret = SQLNumResultCols(statement.get_handle(), &columns);
  if (!check_odbc_error(ret))
    return false;

  auto column = 0;
  _resultset = make_unique<ResultSet>(columns);
  const auto cols = static_cast<int>(_resultset->get_column_count());
  // cerr << "start_reading_results. cols = " << cols << " " << endl;
  while (column < cols) {
    if (!read_next(column++)) {
      return false;
    }
  }

  ret = SQLRowCount(statement.get_handle(), &_resultset->_row_count);
  // cerr << "start_reading_results. row count = " << _resultset->_row_count << " " << endl;
  return check_odbc_error(ret);
}

SQLRETURN OdbcStatementLegacy::query_timeout(const int timeout) {
  const auto& statement = *_statement;
  if (timeout > 0) {
    auto* const to = reinterpret_cast<SQLPOINTER>(static_cast<long long>(timeout));
    const auto ret = SQLSetStmtAttr(statement.get_handle(), SQL_QUERY_TIMEOUT, to, SQL_IS_UINTEGER);
    if (!check_odbc_error(ret))
      return false;
    SQLSetStmtAttr(statement.get_handle(), SQL_ATTR_QUERY_TIMEOUT, to, SQL_IS_UINTEGER);
    if (!check_odbc_error(ret))
      return false;
  }
  return true;
}

bool OdbcStatementLegacy::try_prepare(const shared_ptr<QueryOperationParams>& q) {
  if (!_statement)
    return false;
  const auto& statement = *_statement;
  _query = q;
  const auto query = q->query_string();
  SQLSMALLINT num_cols = 0;

  auto ret =
      SQLPrepare(statement.get_handle(), reinterpret_cast<SQLWCHAR*>(query->data()), query->size());
  if (!check_odbc_error(ret))
    return false;

  ret = SQLNumResultCols(statement.get_handle(), &num_cols);
  if (!check_odbc_error(ret))
    return false;

  _preparedStorage = make_shared<BoundDatumSet>(q);
  _resultset = make_unique<ResultSet>(num_cols);

  for (auto i = 0; i < num_cols; i++) {
    read_next(i);
  }

  SQLSetStmtAttr(statement.get_handle(),
                 SQL_ATTR_ROW_ARRAY_SIZE,
                 reinterpret_cast<SQLPOINTER>(prepared_rows_to_bind),
                 0);
  _preparedStorage->reserve(_resultset->get_metadata(), prepared_rows_to_bind);

  auto i = 0;
  for (const auto& datum : *_preparedStorage) {
    ret = SQLBindCol(statement.get_handle(),
                     static_cast<SQLUSMALLINT>(i + 1),
                     datum->c_type,
                     datum->buffer,
                     datum->buffer_len,
                     datum->get_ind_vec().data());
    if (!check_odbc_error(ret))
      return false;
    ++i;
  }

  _resultset->_end_of_rows = true;
  _prepared = true;

  set_state(OdbcStatementState::STATEMENT_PREPARED);

  return true;
}

SQLRETURN OdbcStatementLegacy::poll_check(SQLRETURN ret,
                                          const shared_ptr<vector<uint16_t>> query,
                                          const bool direct) {
  const auto& statement = *_statement;

  if (ret == SQL_STILL_EXECUTING) {
    while (true) {
      if (direct) {
        ret = SQLExecDirect(
            statement.get_handle(), reinterpret_cast<SQLWCHAR*>(query->data()), SQL_NTS);
      } else {
        ret = SQLExecute(statement.get_handle());
      }

      bool submit_cancel;
      if (ret != SQL_STILL_EXECUTING) {
        break;
      }

#if defined(WINDOWS_BUILD)
      Sleep(1);  // wait 1 MS
#endif
#if defined(LINUX_BUILD)
      usleep(1000);  // wait 1 MS
#endif
      {
        lock_guard<recursive_mutex> lock(g_i_mutex);
        submit_cancel = _cancelRequested;
      }

      if (submit_cancel) {
        cancel_handle();
      }
    }
  }
  return ret;
}

bool OdbcStatementLegacy::raise_cancel() {
  _resultset = make_unique<ResultSet>(0);
  _resultset->_end_of_rows = true;
  _endOfResults = true;  // reset
  const string c_msg = "[Microsoft] Operation canceled";
  const string c_state = "U00000";
  const auto last = make_shared<OdbcError>(c_state.c_str(), c_msg.c_str(), 0, 0, "", "", 0);
  _errors->push_back(last);
  return true;
}

bool OdbcStatementLegacy::try_bcp(const shared_ptr<BoundDatumSet>& param_set, int32_t version) {
  // cerr << "bcp version " << version << endl;
  if (version == 0)
    version = 17;
  // bcp b(param_set, _connection->get_handle());
  // const auto ret = b.insert(version);
  _resultset = make_unique<ResultSet>(0);
  _resultset->_end_of_rows = true;
  _errors->clear();
  // copy(b._errors->begin(), b._errors->end(), back_inserter(*_errors));
  return false;
}

bool OdbcStatementLegacy::bind_fetch(const shared_ptr<BoundDatumSet>& param_set) {
  if (!_statement)
    return false;
  const auto& statement = *_statement;
  const bool polling_mode = get_polling();
  const auto bound = bind_params(param_set);
  if (!bound) {
    // error already set in BindParams
    return false;
  }
  if (polling_mode) {
    const auto s = SQLSetStmtAttr(statement.get_handle(),
                                  SQL_ATTR_ASYNC_ENABLE,
                                  reinterpret_cast<SQLPOINTER>(SQL_ASYNC_ENABLE_ON),
                                  0);
    if (!check_odbc_error(s)) {
      return false;
    }
  }

  auto ret = SQLExecute(statement.get_handle());
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

  if (!check_odbc_error(ret))
    return false;

  ret = SQLRowCount(statement.get_handle(), &_resultset->_row_count);
  return check_odbc_error(ret);
}

bool OdbcStatementLegacy::cancel_handle() {
  if (!_statement)
    return false;
  const auto& hnd = *_statement;
  const auto ret2 = SQLCancelHandle(SQL_HANDLE_STMT, hnd.get_handle());
  if (!check_odbc_error(ret2)) {
    // fprintf(stderr, "cancel req failed state %d %ld \n", _statementState, _statementId);
    return false;
  }
  {
    lock_guard<recursive_mutex> lock(g_i_mutex);
    _cancelRequested = false;
  }
  // set_state(OdbcStatementState::STATEMENT_CANCELLED);
  return true;
}

bool OdbcStatementLegacy::try_execute_direct(const shared_ptr<QueryOperationParams>& q,
                                             const shared_ptr<BoundDatumSet>& param_set) {
  if (!_statement)
    return false;

  // cout << "id " << _statementId << " try_execute_direct" << endl;
  _errors->clear();
  _query = q;
  const auto timeout = q->timeout();
  auto& pars = *param_set;

  if (pars.size() > 0) {
    const auto& first = param_set->atIndex(0);
    if (first->is_bcp) {
      return try_bcp(param_set, first->bcp_version);
    }
  }
  const bool polling_mode = get_polling();
  {
    lock_guard<recursive_mutex> lock(g_i_mutex);
    set_state(OdbcStatementState::STATEMENT_BINDING);
    const auto bound = bind_params(param_set);
    if (!bound) {
      // error already set in BindParams
      return false;
    }

    _endOfResults = true;  // reset
    const auto ret = query_timeout(timeout);
    if (!check_odbc_error(ret))
      return false;

    if (polling_mode) {
      SQLSetStmtAttr(_statement->get_handle(),
                     SQL_ATTR_ASYNC_ENABLE,
                     reinterpret_cast<SQLPOINTER>(SQL_ASYNC_ENABLE_ON),
                     0);
    }
  }
  const auto query = q->query_string();

  set_state(OdbcStatementState::STATEMENT_SUBMITTED);
  SQLRETURN ret = SQLExecDirect(
      _statement->get_handle(), reinterpret_cast<SQLWCHAR*>(query->data()), query->size());
  {
    // we may have cancelled this query on a different thread
    // so only switch state if this query completed.
    lock_guard<recursive_mutex> lock(g_i_mutex);
    {
      const auto state = get_state();
      if (state == OdbcStatementState::STATEMENT_SUBMITTED) {
        set_state(OdbcStatementState::STATEMENT_READING);
      }
    }
  }
  if (polling_mode) {
    set_state(OdbcStatementState::STATEMENT_POLLING);
    ret = poll_check(ret, query, true);
  }

  // cerr << "ret = " << ret << endl;
  if (ret == SQL_NO_DATA) {
    // cerr << "no data = " << ret << endl;
    start_reading_results();
    _resultset = make_unique<ResultSet>(0);
    _resultset->_end_of_rows = true;
    return true;
  }

  if (!SQL_SUCCEEDED(ret)) {
    // cerr << "SQL_SUCCEEDED = " << ret << endl;
    return_odbc_error();
    _resultset = make_unique<ResultSet>(0);
    _resultset->_end_of_rows = true;
    return false;
  }

  if (ret == SQL_SUCCESS_WITH_INFO) {
    return_odbc_error();
    _boundParamsSet = param_set;
    if (start_reading_results()) {
      _resultset->_end_of_rows = false;
    } else {
      _resultset = make_unique<ResultSet>(0);
      _resultset->_end_of_rows = true;
    }
    // cout << "id " << _statementId << "SQL_SUCCESS_WITH_INFO = " << ret << endl;
    return false;
  }
  _boundParamsSet = param_set;
  // cout << "id " << _statementId << " start_reading_results ret " << ret << endl;
  return start_reading_results();
}

bool OdbcStatementLegacy::dispatch_prepared(const SQLSMALLINT t,
                                            const size_t column_size,
                                            const size_t rows_read,
                                            const size_t column) const {
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
      res = reserved_string(rows_read, column_size, column);
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
    case SQL_REAL:
    case SQL_FLOAT:
    case SQL_DOUBLE:
      res = reserved_decimal(rows_read, column);
      break;

    case SQL_BINARY:
    case SQL_VARBINARY:
    case SQL_LONGVARBINARY:
    case SQL_SS_UDT:
      res = reserved_binary(rows_read, column_size, column);
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
      res = reserved_string(rows_read, column_size, column);
      break;
  }

  return res;
}

bool OdbcStatementLegacy::dispatch(const SQLSMALLINT t, const size_t row_id, const size_t column) {
  if (!_statement)
    return false;
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

    case SQL_SMALLINT:
    case SQL_TINYINT:
    case SQL_INTEGER:
    case SQL_C_SLONG:
    case SQL_C_SSHORT:
    case SQL_C_STINYINT:
    case SQL_C_ULONG:
    case SQL_C_USHORT:
    case SQL_C_UTINYINT:
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

    case SQL_NUMERIC:
      if (_numericStringEnabled) {
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

bool OdbcStatementLegacy::d_variant(const size_t row_id, const size_t column) {
  const auto& statement = *_statement;
  SQLLEN variant_type = 0;
  SQLLEN iv = 0;
  char b = 0;
  // Figure out the length
  auto ret = SQLGetData(
      statement.get_handle(), static_cast<SQLSMALLINT>(column + 1), SQL_C_BINARY, &b, 0, &iv);
  if (!check_odbc_error(ret))
    return false;
  // Figure out the type
  ret = SQLColAttribute(statement.get_handle(),
                        column + 1,
                        SQL_CA_SS_VARIANT_TYPE,
                        nullptr,
                        0,
                        nullptr,
                        &variant_type);
  if (!check_odbc_error(ret))
    return false;
  // set the definiton to actual data underlying data type.
  auto& definition = _resultset->get_meta_data(static_cast<int>(column));
  definition.dataType = static_cast<SQLSMALLINT>(variant_type);
  const auto res = dispatch(definition.dataType, row_id, column);
  return res;
}

bool OdbcStatementLegacy::d_time(const size_t row_id, const size_t column) {
  const auto& statement = *_statement;
  SQLLEN str_len_or_ind_ptr = 0;
  SQL_SS_TIME2_STRUCT time = {};
  SQLLEN precision = 0;
  SQLLEN colscale = 0;
  const auto ret2 = SQLColAttribute(
      statement.get_handle(), column + 1, SQL_COLUMN_PRECISION, nullptr, 0, nullptr, &precision);
  if (!check_odbc_error(ret2))
    return false;
  const auto ret3 = SQLColAttribute(
      statement.get_handle(), column + 1, SQL_COLUMN_SCALE, nullptr, 0, nullptr, &colscale);
  if (!check_odbc_error(ret3))
    return false;
  const auto ret = SQLGetData(statement.get_handle(),
                              static_cast<SQLSMALLINT>(column + 1),
                              SQL_C_BINARY,
                              &time,
                              sizeof(time),
                              &str_len_or_ind_ptr);

  if (!check_odbc_error(ret))
    return false;

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

bool OdbcStatementLegacy::get_data_timestamp_offset(const size_t row_id, const size_t column) {
  const auto& statement = *_statement;
  const auto storage = make_shared<DatumStorageLegacy>();
  storage->ReserveTimestampOffset(1);
  SQLLEN str_len_or_ind_ptr = 0;

  const auto ret = SQLGetData(statement.get_handle(),
                              static_cast<SQLSMALLINT>(column + 1),
                              SQL_C_DEFAULT,
                              storage->timestampoffsetvec_ptr->data(),
                              sizeof(SQL_SS_TIMESTAMPOFFSET_STRUCT),
                              &str_len_or_ind_ptr);
  if (!check_odbc_error(ret))
    return false;
  if (str_len_or_ind_ptr == SQL_NULL_DATA) {
    _resultset->add_column(row_id, make_shared<NullColumn>(column));
    return true;  // break
  }
  _resultset->add_column(row_id, make_shared<TimestampColumn>(column, storage));
  return true;
}

bool OdbcStatementLegacy::get_data_timestamp(const size_t row_id, const size_t column) {
  const auto& statement = *_statement;
  SQLLEN str_len_or_ind_ptr = 0;
  TIMESTAMP_STRUCT v;
  const auto ret = SQLGetData(statement.get_handle(),
                              static_cast<SQLSMALLINT>(column + 1),
                              SQL_C_TIMESTAMP,
                              &v,
                              sizeof(TIMESTAMP_STRUCT),
                              &str_len_or_ind_ptr);
  if (!check_odbc_error(ret))
    return false;
  if (str_len_or_ind_ptr == SQL_NULL_DATA) {
    _resultset->add_column(row_id, make_shared<NullColumn>(column));
    return true;  // break
  }
  _resultset->add_column(row_id, make_shared<TimestampColumn>(column, v));
  return true;
}

bool OdbcStatementLegacy::get_data_big_int(const size_t row_id, const size_t column) {
  const auto& statement = *_statement;
  DatumStorageLegacy::bigint_t v = 0;
  SQLLEN str_len_or_ind_ptr = 0;
  const auto ret = SQLGetData(statement.get_handle(),
                              static_cast<SQLSMALLINT>(column + 1),
                              SQL_C_SBIGINT,
                              &v,
                              sizeof(DatumStorageLegacy::bigint_t),
                              &str_len_or_ind_ptr);
  if (!check_odbc_error(ret))
    return false;
  if (str_len_or_ind_ptr == SQL_NULL_DATA) {
    _resultset->add_column(row_id, make_shared<NullColumn>(column));
    return true;
  }
  const auto col = make_shared<BigIntColumn>(column, v);
  if (_numericStringEnabled) {
    col->AsString();
  }
  _resultset->add_column(row_id, col);
  return true;
}

bool OdbcStatementLegacy::get_data_long(const size_t row_id, const size_t column) {
  const auto& statement = *_statement;

  long v = 0;
  SQLLEN str_len_or_ind_ptr = 0;
  const auto ret = SQLGetData(statement.get_handle(),
                              static_cast<SQLSMALLINT>(column + 1),
                              SQL_C_SLONG,
                              &v,
                              sizeof(int64_t),
                              &str_len_or_ind_ptr);
  if (!check_odbc_error(ret))
    return false;
  if (str_len_or_ind_ptr == SQL_NULL_DATA) {
    _resultset->add_column(row_id, make_shared<NullColumn>(column));
    return true;
  }
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
  const auto ret = SQLGetData(statement.get_handle(),
                              static_cast<SQLSMALLINT>(column + 1),
                              SQL_C_BIT,
                              &v,
                              sizeof(char),
                              &str_len_or_ind_ptr);
  if (!check_odbc_error(ret))
    return false;
  if (str_len_or_ind_ptr == SQL_NULL_DATA) {
    _resultset->add_column(row_id, make_shared<NullColumn>(column));
    return true;
  }
  _resultset->add_column(row_id, make_shared<BoolColumn>(column, v));
  return true;
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

    SQL_SS_TIMESTAMPOFFSET_STRUCT datetime = {};
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

bool OdbcStatementLegacy::get_data_numeric(const size_t row_id, const size_t column) {
  const auto& statement = *_statement;
  SQLLEN str_len_or_ind_ptr = 0;
  SQL_NUMERIC_STRUCT v;
  const auto ret = SQLGetData(statement.get_handle(),
                              static_cast<SQLSMALLINT>(column + 1),
                              SQL_C_NUMERIC,
                              &v,
                              sizeof(SQL_NUMERIC_STRUCT),
                              &str_len_or_ind_ptr);
  if (!check_odbc_error(ret))
    return false;
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
  const auto ret = SQLGetData(statement.get_handle(),
                              static_cast<SQLSMALLINT>(column + 1),
                              SQL_C_DOUBLE,
                              &v,
                              sizeof(double),
                              &str_len_or_ind_ptr);
  if (!check_odbc_error(ret))
    return false;
  if (str_len_or_ind_ptr == SQL_NULL_DATA) {
    _resultset->add_column(row_id, make_shared<NullColumn>(column));
    return true;
  }

  const auto v2 = trunc(v);
  if (v2 == v &&
      v2 >= static_cast<long double>(numeric_limits<DatumStorageLegacy::bigint_t>::min()) &&
      v2 <= static_cast<long double>(numeric_limits<DatumStorageLegacy::bigint_t>::max())) {
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

bool OdbcStatementLegacy::get_data_binary(const size_t row_id, const size_t column) {
  auto storage = make_shared<DatumStorageLegacy>();

  const auto& statement = *_statement;
  constexpr SQLLEN atomic_read = 24 * 1024;
  auto bytes_to_read = atomic_read;
  storage->ReserveChars(bytes_to_read + 1);
  const auto& char_data = storage->charvec_ptr;
  auto* write_ptr = char_data->data();
  SQLLEN total_bytes_to_read = 0;
  auto r = SQLGetData(statement.get_handle(),
                      static_cast<SQLSMALLINT>(column + 1),
                      SQL_C_BINARY,
                      write_ptr,
                      bytes_to_read,
                      &total_bytes_to_read);
  if (!check_odbc_error(r))
    return false;
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
    r = SQLGetData(statement.get_handle(),
                   static_cast<SQLSMALLINT>(column + 1),
                   SQL_C_BINARY,
                   write_ptr,
                   bytes_to_read,
                   &total_bytes_to_read);
    if (!check_odbc_error(r))
      return false;
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
    r = SQLGetDiagRec(SQL_HANDLE_STMT,
                      statement.get_handle(),
                      1,
                      sql_state.data(),
                      &native_error,
                      nullptr,
                      0,
                      &text_length);
    if (!check_odbc_error(r)) {
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
  lob_capture() : total_bytes_to_read(atomic_read_bytes) {
    storage.ReserveUint16(atomic_read_bytes / item_size + 1);
    src_data = storage.uint16vec_ptr;
    write_ptr = src_data->data();
    maxvarchar = false;
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
  auto r = SQLGetData(statement.get_handle(),
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
  if (!check_odbc_error(r))
    return false;
  auto status = false;
  auto more = check_more_read(r, status);
  if (!status) {
    // cerr << "lob check_more_read " << endl;
    return false;
  }
  capture.on_first_read();
  while (more) {
    capture.bytes_to_read = min(capture.atomic_read_bytes, capture.total_bytes_to_read);
    r = SQLGetData(statement.get_handle(),
                   static_cast<SQLSMALLINT>(column + 1),
                   SQL_C_WCHAR,
                   capture.write_ptr,
                   capture.bytes_to_read + capture.item_size,
                   &capture.total_bytes_to_read);
    capture.on_next_read();
    if (!check_odbc_error(r)) {
      // cerr << "lob error " << endl;
      return false;
    }
    more = check_more_read(r, status);
    if (!status) {
      // cerr << "lob status " << endl;
      return false;
    }
  }
  capture.trim();
  // cerr << "lob add StringColumn column " << endl;
  _resultset->add_column(
      row_id, make_shared<StringColumn>(column, capture.src_data, capture.src_data->size()));
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
    size_t actual_size = ind[row_id] / size;
    auto to_read = min(actual_size, column_size);
    const auto value = make_shared<CharColumn>(column, storage->charvec_ptr, offset, to_read);
    _resultset->add_column(row_id, value);
  }
  return true;
}

bool OdbcStatementLegacy::reserved_string(const size_t row_count,
                                          const size_t column_size,
                                          const size_t column) const {
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
    auto to_read = min(actual_size, column_size);
    const auto value = make_shared<StringColumn>(column, storage->uint16vec_ptr, offset, to_read);
    _resultset->add_column(row_id, value);
  }
  return true;
}

bool OdbcStatementLegacy::reserved_binary(const size_t row_count,
                                          const size_t column_size,
                                          const size_t column) const {
  const auto& bound_datum = _preparedStorage->atIndex(static_cast<int>(column));
  auto& ind = bound_datum->get_ind_vec();
  const auto storage = bound_datum->get_storage();
  for (size_t row_id = 0; row_id < row_count; ++row_id) {
    const auto str_len_or_ind_ptr = ind[row_id];
    if (str_len_or_ind_ptr == SQL_NULL_DATA) {
      _resultset->add_column(row_id, make_shared<NullColumn>(column));
      continue;
    }
    auto offset = column_size * row_id;
    const auto value = make_shared<BinaryColumn>(column, storage, offset, ind[row_id]);
    _resultset->add_column(row_id, value);
  }
  return true;
}

bool OdbcStatementLegacy::bounded_string(SQLLEN display_size, const size_t row_id, size_t column) {
  // cerr << "bounded_string ... " << endl;

  const auto storage = make_shared<DatumStorageLegacy>();
  constexpr auto size = sizeof(uint16_t);
  SQLLEN value_len = 0;

  display_size++;
  storage->ReserveUint16(display_size);  // increment for null terminator
  const auto r = SQLGetData(_statement->get_handle(),
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

  value_len /= size;

  // assert(value_len >= 0 && value_len <= display_size - 1);
  storage->uint16vec_ptr->resize(value_len);
  const auto value = make_shared<StringColumn>(column, storage, value_len);
  _resultset->add_column(row_id, value);

  return true;
}

bool OdbcStatementLegacy::try_read_string(bool binary, const size_t row_id, const size_t column) {
  SQLLEN display_size = 0;
  // cerr << " try_read_string row_id = " << row_id << " column = " << column;
  const auto r = SQLColAttribute(_statement->get_handle(),
                                 column + 1,
                                 SQL_DESC_DISPLAY_SIZE,
                                 nullptr,
                                 0,
                                 nullptr,
                                 &display_size);
  if (!check_odbc_error(r))
    return false;

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

bool OdbcStatementLegacy::try_read_next_result() {
  // fprintf(stderr, "TryReadNextResult\n");
  // fprintf(stderr, "TryReadNextResult ID = %llu\n ", get_statement_id());
  const auto state = get_state();
  if (state == OdbcStatementState::STATEMENT_CANCELLED ||
      state == OdbcStatementState::STATEMENT_CANCEL_HANDLE) {
    // fprintf(stderr, "TryReadNextResult - cancel mode.\n");
    _resultset->_end_of_rows = true;
    _endOfResults = true;
    set_state(OdbcStatementState::STATEMENT_ERROR);
    return false;
  }
  const auto& statement = *_statement;
  const auto ret = SQLMoreResults(statement.get_handle());
  switch (ret) {
    case SQL_NO_DATA: {
      // fprintf(stderr, "SQL_NO_DATA\n");
      _endOfResults = true;
      _resultset->_end_of_rows = true;
      if (_prepared) {
        SQLCloseCursor(statement.get_handle());
      }
      return true;
    }

    case SQL_SUCCESS_WITH_INFO: {
      return_odbc_error();
      const auto res = start_reading_results();
      if (res) {
        _resultset->_end_of_rows = false;
      } else {
        _resultset->_end_of_rows = true;
      }
      return false;
    }
    default:;
  }
  _endOfResults = false;
  return start_reading_results();
}
}  // namespace mssql
