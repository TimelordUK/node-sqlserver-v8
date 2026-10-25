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

namespace mssql {

OdbcStatementLegacy::~OdbcStatementLegacy() {
  SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] ~OdbcStatementLegacy");
  if (get_state() != OdbcStatementState::STATEMENT_CLOSED) {
    set_state(OdbcStatementState::STATEMENT_CLOSED);
  }
  // Clean up notifier
  _stateNotifier.reset();
  _stateNotifierShared.reset();
}

void OdbcStatementLegacy::assign_result(std::shared_ptr<QueryResult>& result,
                                        std::shared_ptr<ResultSet> resultset) {
  if (!_resultset) {
    // nothing was read (e.g. a prepare that failed before it described the result)
    result->set_end_of_rows(true);
    result->set_end_of_results(true);
    return;
  }
  auto cols = _resultset->get_column_count();
  for (size_t i = 0; i < cols; ++i) {
    auto col = _resultset->get_meta_data(i);
    result->addColumn(col);
  }
  result->set_end_of_rows(this->_resultset->EndOfRows());
  result->set_end_of_results(this->_resultset->EndOfResults());
  auto raw_row_count = this->_resultset->_row_count;
  result->set_row_count(raw_row_count >= 0 ? static_cast<size_t>(raw_row_count) : 0);
  auto e0 = _errors->size() > 0 ? _errors->at(0)->message.c_str() : "no errors";
  SQL_LOG_DEBUG_STREAM("OdbcStatementLegacy::assign_result ["
                       << _handle.toString() << "] result = " << result->toString()
                       << " error count " << _errors->size() << " cols " << cols << " e0 " << e0);
}

bool OdbcStatementLegacy::Execute(const std::shared_ptr<BoundDatumSet> parameters,
                                  std::shared_ptr<QueryResult>& result) {
  SQL_LOG_FUNC_TRACER();
  lock_guard<recursive_mutex> lock(g_i_mutex);
  auto res = try_execute_direct(_operationParams, parameters);
  assign_result(result, _resultset);
  return res;
}

/**
 * @brief Get the statement type
 */
StatementType OdbcStatementLegacy::GetType() const {
  return StatementType::Legacy;
}

/**
 * @brief Get the native ODBC statement handle
 */
SQLHSTMT OdbcStatementLegacy::GetHandle() const {
  return _statement->get_handle();
}

/**
 * @brief Get the statement handle (our wrapper type)
 */
StatementHandle OdbcStatementLegacy::GetStatementHandle() const {
  return _handle;
}

/**
 * @brief Check if numeric string mode is enabled
 */
bool OdbcStatementLegacy::IsNumericStringEnabled() const {
  return _numericStringEnabled;
}

/**
 * @brief Get the current state of the statement
 * @return Current state
 */
OdbcStatementState OdbcStatementLegacy::GetState() const {
  return _statementState;
}

std::vector<std::shared_ptr<IOdbcRow>>& OdbcStatementLegacy::GetRows() {
  return _rows;
}

std::shared_ptr<QueryResult> OdbcStatementLegacy::GetMetaData() {
  auto res = make_shared<QueryResult>();
  res->set_end_of_rows(false);
  res->set_end_of_results(false);
  res->set_row_count(_resultset->_row_count);

  auto ncols = this->_resultset->get_column_count();
  for (size_t i = 0; i < ncols; i++) {
    auto col = this->_resultset->get_meta_data(i);
    res->addColumn(col);
  }
  return res;
}

bool OdbcStatementLegacy::TryReadRows(std::shared_ptr<QueryResult> result,
                                      const size_t number_rows) {
  SQL_LOG_FUNC_TRACER();
  lock_guard<recursive_mutex> lock(g_i_mutex);
  SQL_LOG_DEBUG_STREAM("OdbcStatementLegacy::TryReadRows [" << _handle.toString() << "]");
  // what this fetch reports is only what its own calls came with
  _errors->clear();
  _errorHandler->ClearErrors();
  auto res = try_read_columns(number_rows);
  assign_result(result, _resultset);
  return res;
}

bool OdbcStatementLegacy::ReadNextResult(std::shared_ptr<QueryResult> result) {
  SQL_LOG_FUNC_TRACER();
  lock_guard<recursive_mutex> lock(g_i_mutex);
  _errors->clear();
  _errorHandler->ClearErrors();

  auto res = try_read_next_result();
  SQL_LOG_DEBUG_STREAM("OdbcStatementLegacy::ReadNextResult [" << _handle.toString() << "]");
  assign_result(result, _resultset);
  return res;
}

OdbcStatementLegacy::OdbcStatementLegacy(
    std::shared_ptr<IOdbcConnectionHandle> connectionHandle,
    std::shared_ptr<IOdbcStatementHandle> statement,
    std::shared_ptr<OdbcErrorHandler> errorHandler,
    std::shared_ptr<IOdbcApi> odbcApi,
    StatementHandle handle,
    const std::shared_ptr<QueryOperationParams> operationParams)
    : _prepared(false),
      _cancelRequested(false),
      _pollingEnabled(false),
      _numericStringEnabled(false),
      _bigIntAsNativeEnabled(false),
      _resultset(nullptr),
      _boundParamsSet(nullptr),
      _statement(statement),
      _errorHandler(errorHandler),
      _odbcApi(odbcApi),
      _handle(handle),
      _operationParams(operationParams),
      _connectionHandle(connectionHandle) {
  set_state(OdbcStatementState::STATEMENT_CREATED);
  // cerr << "OdbcStatement() " << _statementId << " " << endl;
  // fprintf(stderr, "OdbcStatement::OdbcStatement OdbcStatement ID = %ld\n ", statement_id);
  _numericStringEnabled = _operationParams->numeric_string;
  _bigIntAsNativeEnabled = _operationParams->bigint_as_native;
  _pollingEnabled.store(_operationParams->polling);
  _errors = make_shared<vector<shared_ptr<OdbcError>>>();
}

// this will show on a different thread to the current executing query.
bool OdbcStatementLegacy::Cancel() {
  // Get current state atomically - no mutex needed
  const auto state = _statementState.load();

  SQL_LOG_DEBUG_STREAM("OdbcStatementLegacy::Cancel Enter ["
                       << _handle.toString() << "] cancel " << _statementId << " "
                       << _pollingEnabled << " state " << OdbcStatementStateToString(state));

  if (!_pollingEnabled && (state == OdbcStatementState::STATEMENT_SUBMITTED ||
                           state == OdbcStatementState::STATEMENT_READING)) {
    // this runs on the cancel thread while a worker thread may be inside SQLExecDirect
    // or SQLFetch on this statement. SQLCancelHandle is made to be called from another
    // thread; the result set and error list are not - the worker writes rows into
    // _resultset without a lock, and replacing it here freed it under a running fetch
    // (segv). the worker's own execute / fetch returns HY008 (or HY010 / 24000) and
    // ends the query, setting the result set flags itself.
    if (!_statement) {
      return false;
    }
    _cancelHandleIssued.store(true);
    const auto ret = _odbcApi->SQLCancelHandle(SQL_HANDLE_STMT, _statement->get_handle());
    set_state(OdbcStatementState::STATEMENT_CANCEL_HANDLE);
    SQL_LOG_DEBUG_STREAM("OdbcStatementLegacy::Cancel Exit [" << _handle.toString()
                                                              << "] SQLCancelHandle returned "
                                                              << ret);
    return SQL_SUCCEEDED(ret);
  }
  if (get_polling()) {
    _cancelRequested.store(true);
    return true;
  }
  SQLINTEGER native_error = -1;
  const auto* c_state = "CANCEL";
  const auto* c_msg =
      "Error: [msnodesql] cancel only supported for statements where polling is enabled.";
  _errors->push_back(make_shared<OdbcError>(c_state, c_msg, native_error, 0, "", "", 0));
  return false;
}

void OdbcStatementLegacy::SetStateNotifier(std::shared_ptr<IOdbcStateNotifier> notifier) {
  lock_guard<recursive_mutex> lock(g_i_mutex);
  _stateNotifierShared = notifier;  // Keep the shared_ptr alive
  if (notifier) {
    _stateNotifier = std::make_unique<WeakStateNotifier>(notifier);
  } else {
    _stateNotifier.reset();
  }
}

void OdbcStatementLegacy::set_state(const OdbcStatementState state) {
  // Use atomic exchange to get old state and set new state atomically
  OdbcStatementState oldState = _statementState.exchange(state);

  SQL_LOG_DEBUG_STREAM("OdbcStatementLegacy::set_state ["
                       << _handle.toString() << "] set_state " << _statementId << " "
                       << OdbcStatementStateToString(oldState) << " -> "
                       << OdbcStatementStateToString(state));

  // Only notify if state actually changed and we have a notifier (this is thread-safe)
  if (_stateNotifier && oldState != state) {
    SQL_LOG_DEBUG_STREAM("OdbcStatementLegacy::set_state [" << _handle.toString()
                                                            << "] NotifyStateChange ");
    _stateNotifier->NotifyStateChange(_handle, oldState, state);
  } else if (oldState == state) {
    SQL_LOG_DEBUG_STREAM("OdbcStatementLegacy::set_state ["
                         << _handle.toString() << "] No state change - skipping notification");
  }
}

OdbcStatementState OdbcStatementLegacy::get_state() {
  // Atomic load - no mutex needed
  return _statementState.load();
}

bool OdbcStatementLegacy::set_polling(const bool mode) {
  lock_guard<recursive_mutex> lock(g_i_mutex);
  if (_statementState == OdbcStatementState::STATEMENT_BINDING ||
      _statementState == OdbcStatementState::STATEMENT_SUBMITTED) {
    return true;
  }
  _pollingEnabled.store(mode);
  return true;
}

bool OdbcStatementLegacy::get_polling() {
  return _pollingEnabled.load();
}

bool OdbcStatementLegacy::set_numeric_string(const bool mode) {
  lock_guard<recursive_mutex> lock(g_i_mutex);
  _numericStringEnabled = mode;
  return true;
}

bool OdbcStatementLegacy::set_bigint_as_native(const bool mode) {
  lock_guard<recursive_mutex> lock(g_i_mutex);
  _bigIntAsNativeEnabled = mode;
  return true;
}

Napi::Array OdbcStatementLegacy::unbind_params(Napi::Env env) const {
  if (_boundParamsSet != nullptr) {
    return _boundParamsSet->unbind(env);
  }
  return Napi::Array::New(env, 0);
}

Napi::Object OdbcStatementLegacy::get_meta_value(Napi::Env env) const {
  if (_cancelRequested.load() || _resultset == nullptr) {
    return Napi::Object::New(env);
  }
  return _resultset->meta_to_value(env);
}

bool OdbcStatementLegacy::end_of_results() const {
  return _resultset->EndOfResults();
}

Napi::Object OdbcStatementLegacy::handle_end_of_results(Napi::Env env) const {
  return Napi::Boolean::New(env, _resultset->EndOfResults()).As<Napi::Object>();
}

Napi::Object OdbcStatementLegacy::end_of_rows(Napi::Env env) const {
  return Napi::Boolean::New(env, _resultset->EndOfRows()).As<Napi::Object>();
}

// what the driver says about how it runs the statement for us, not what the statement did:
// 01S02 "cursor type changed" and 16954 "executing SQL directly; no cursor", from the block
// cursor a prepared statement is read with. whether they come differs by driver build and
// environment, and they tell the caller nothing about their query, so they are not passed on
static void drop_cursor_notices(vector<shared_ptr<OdbcError>>& diagnostics) {
  diagnostics.erase(std::remove_if(diagnostics.begin(),
                                   diagnostics.end(),
                                   [](const auto& e) {
                                     return e->sqlstate == "01S02" ||
                                            (e->sqlstate == "01000" && e->code == 16954);
                                   }),
                    diagnostics.end());
}

bool OdbcStatementLegacy::return_odbc_error() {
  if (!_statement) {
    SQL_LOG_DEBUG_STREAM("return_odbc_error: no statement");
    return false;
  }
  _statement->read_errors(_odbcApi, _errors);
  drop_cursor_notices(*_errors);
  SQL_LOG_DEBUG_STREAM("return_odbc_error: " << _errors->size());
  _errorHandler->ClearErrors();
  for (const auto& error : *_errors) {
    _errorHandler->AddError(error);
  }
  // only a real error puts the statement in error. info (sqlstate 01xxx, e.g. a PRINT)
  // comes with SQL_SUCCESS_WITH_INFO on a statement that is still reading - and while it
  // is, a cancel must reach it (#479).
  const auto is_error = std::any_of(_errors->begin(), _errors->end(), [](const auto& e) {
    return e->sqlstate.rfind("01", 0) != 0;
  });
  if (is_error) {
    SQL_LOG_DEBUG_STREAM("return_odbc_error: has errors");
    set_state(OdbcStatementState::STATEMENT_ERROR);
  }
  return false;
}

// keep the diagnostics a call came with when it did not fail. msodbcsql hands a warning
// raised at the end of a result set - 8153 "null value is eliminated by an aggregate",
// 3607 "division by zero occurred" - to the SQLFetch that returns SQL_NO_DATA, and only
// there. they are added to what this call has collected so far (read_errors replaces),
// so one fetch batch keeps every message its fetches came with, in order.
void OdbcStatementLegacy::keep_diagnostics() {
  if (!_statement) {
    return;
  }
  auto found = make_shared<vector<shared_ptr<OdbcError>>>();
  _statement->read_errors(_odbcApi, found);
  drop_cursor_notices(*found);
  if (found->empty()) {
    return;
  }
  SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] keep_diagnostics: " << found->size());
  for (const auto& error : *found) {
    _errors->push_back(error);
    _errorHandler->AddError(error);
  }
  const auto is_error = std::any_of(found->begin(), found->end(), [](const auto& e) {
    return e->sqlstate.rfind("01", 0) != 0;
  });
  if (is_error) {
    set_state(OdbcStatementState::STATEMENT_ERROR);
  }
}

// a non polling cancel (SQLCancelHandle from the cancel thread) that lands while no
// ODBC call is running on this statement - e.g. between fetch batches - does not make
// the next call return HY008: the driver just closes the cursor, so the next SQLFetch
// returns HY010 or SQL_NO_DATA and SQLMoreResults HY007. end the query here, on the
// worker thread, as the cancel it is.
bool OdbcStatementLegacy::return_cancelled() {
  if (_statement) {
    _statement->read_errors(_odbcApi, _errors);
    drop_cursor_notices(*_errors);
  }
  const auto driver_reported = std::any_of(
      _errors->begin(), _errors->end(), [](const auto& e) { return e->sqlstate == "HY008"; });
  if (!driver_reported) {
    _errors->clear();
    _errors->push_back(
        make_shared<OdbcError>("HY008", "[msnodesql] Operation canceled", 0, 0, "", "", 0));
  }
  _errorHandler->ClearErrors();
  for (const auto& error : *_errors) {
    _errorHandler->AddError(error);
  }
  _resultset->_end_of_rows = true;
  _resultset->_end_of_results = true;
  set_state(OdbcStatementState::STATEMENT_ERROR);
  return false;
}

// a statement failing part way through a batch, e.g. raiserror severity 16, does not end
// the batch: SQL Server runs the statements after it and SQLMoreResults moves on to them.
// a cancel, timeout or broken connection does end it, as does an error that is only about
// the statement's own state (which SQLMoreResults would just repeat).
bool OdbcStatementLegacy::more_results_after_error() const {
  if (!_statement || _cancelRequested.load() || _cancelHandleIssued.load() || _errors->empty()) {
    return false;
  }
  return std::none_of(_errors->begin(), _errors->end(), [](const auto& e) {
    const auto& s = e->sqlstate;
    return s == "HY008" || s == "HYT00" || s == "HY010" || s == "HY007" || s == "24000" ||
           s.rfind("08", 0) == 0;
  });
}

// whether the batch goes on can only be known by asking: call SQLMoreResults now, so a
// batch that ends with the error still ends with it (one callback, more = false). the
// result it moves to is picked up by the next try_read_next_result. the diag records of
// the failed statement were read before this call replaces them.
bool OdbcStatementLegacy::look_ahead_after_error() {
  _pendingMoreResults.reset();
  if (!more_results_after_error()) {
    return false;
  }
  const auto ret = _odbcApi->SQLMoreResults(_statement->get_handle());
  SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] look_ahead_after_error SQLMoreResults "
                           << ret);
  if (ret == SQL_NO_DATA) {
    return false;
  }
  _pendingMoreResults = ret;
  // the batch goes on, so the statement is reading again - and can be cancelled (#479).
  // not over a cancel that has landed meanwhile.
  if (get_state() == OdbcStatementState::STATEMENT_ERROR) {
    set_state(OdbcStatementState::STATEMENT_READING);
  }
  return true;
}

bool OdbcStatementLegacy::check_odbc_error(const SQLRETURN ret) {
  if (!SQL_SUCCEEDED(ret)) {
    SQL_LOG_DEBUG_STREAM("check_odbc_error failed: " << ret);
    if (_cancelHandleIssued.load()) {
      return return_cancelled();
    }
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
  auto ret = _odbcApi->SQLColAttribute(_statement->get_handle(),
                                       index,
                                       SQL_DESC_TYPE_NAME,
                                       type_name.data(),
                                       type_name.size(),
                                       &type_name_len,
                                       nullptr);
  if (!check_odbc_error(ret)) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString()
                             << "] read_col_attributes failed to get col attribute");
    return false;
  }

  current.dataTypeName = odbcstr::swcvec2str(type_name, type_name_len);
  // wcerr << "type_name_len " << current.dataTypeName << endl;
  switch (current.dataType) {
    case SQL_SS_VARIANT: {
      SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "]  read_col_attributes: SQL_SS_VARIANT");
      // dispatch as variant type which reads underlying column type and re-reads correctly.
    } break;

    case SQL_SS_UDT: {
      vector<SQLWCHAR> udt_type_name(l, 0);
      SQLSMALLINT udt_type_name_len = 0;
      ret = _odbcApi->SQLColAttribute(_statement->get_handle(),
                                      index,
                                      SQL_CA_SS_UDT_TYPE_NAME,
                                      udt_type_name.data(),
                                      udt_type_name.size(),
                                      &udt_type_name_len,
                                      nullptr);
      if (!check_odbc_error(ret)) {
        SQL_LOG_DEBUG_STREAM(
            "read_col_attributes failed to get udt type name SQL_CA_SS_UDT_TYPE_NAME");
        return false;
      }
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
  auto ret = _odbcApi->SQLDescribeCol(statement.get_handle(),
                                      index,
                                      current.name.data(),
                                      current.name.size(),
                                      &current.colNameLen,
                                      &current.dataType,
                                      &current.columnSize,
                                      &current.decimalDigits,
                                      &current.nullable);
  if (!check_odbc_error(ret)) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] read_next failed to describe col");
    return false;
  }
  current.name.resize(current.colNameLen);

  // wcerr << "read_next " << column << " name = " << current.name << endl;
  ret = read_col_attributes(current, column);
  if (!check_odbc_error(ret)) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] read_next failed to read col attributes");
    return false;
  }

  return ret;
}

bool OdbcStatementLegacy::start_reading_results() {
  if (!_statement) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] start_reading_results: no statement");
    return false;
  }

  if (_cancelRequested.load()) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] start_reading_results: cancel requested");
    _resultset = make_unique<ResultSet>(0);
    return true;
  }

  SQLSMALLINT columns = 0;
  const auto& statement = *_statement;
  auto ret = _odbcApi->SQLNumResultCols(statement.get_handle(), &columns);
  if (!check_odbc_error(ret)) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString()
                             << "] start_reading_results failed to get num result cols");
    return false;
  }

  auto column = 0;
  _resultset = make_unique<ResultSet>(columns);
  const auto cols = static_cast<int>(_resultset->get_column_count());
  // cerr << "start_reading_results. cols = " << cols << " " << endl;
  while (column < cols) {
    if (!read_next(column++)) {
      SQL_LOG_DEBUG_STREAM("[" << _handle.toString()
                               << "] start_reading_results failed to read next column " << column);
      return false;
    }
  }

  ret = _odbcApi->SQLRowCount(statement.get_handle(), &_resultset->_row_count);
  auto result = check_odbc_error(ret);
  if (!result) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString()
                             << "] start_reading_results failed to get row count");
  }
  SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] start_reading_results row count "
                           << _resultset->_row_count << " columns " << cols);
  return result;
}

SQLRETURN OdbcStatementLegacy::query_timeout(const int timeout) {
  const auto& statement = *_statement;
  if (timeout > 0) {
    auto* const to = reinterpret_cast<SQLPOINTER>(static_cast<long long>(timeout));
    auto ret =
        _odbcApi->SQLSetStmtAttr(statement.get_handle(), SQL_QUERY_TIMEOUT, to, SQL_IS_UINTEGER);
    if (!check_odbc_error(ret)) {
      SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] query_timeout failed to set stmt attr");
      return false;
    }
    ret = _odbcApi->SQLSetStmtAttr(
        statement.get_handle(), SQL_ATTR_QUERY_TIMEOUT, to, SQL_IS_UINTEGER);
    if (!check_odbc_error(ret)) {
      SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] query_timeout failed to set stmt attr");
    }
    return false;
  }
  return true;
}

SQLRETURN OdbcStatementLegacy::poll_check(SQLRETURN ret,
                                          const shared_ptr<vector<uint16_t>> query,
                                          const bool direct) {
  const auto& statement = *_statement;

  if (ret == SQL_STILL_EXECUTING) {
    while (true) {
      if (direct) {
        ret = _odbcApi->SQLExecDirect(
            statement.get_handle(), reinterpret_cast<SQLWCHAR*>(query->data()), SQL_NTS);
      } else {
        ret = _odbcApi->SQLExecute(statement.get_handle());
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
        submit_cancel = _cancelRequested.load();
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
  _resultset->_end_of_results = true;  // reset
  const string c_msg = "[Microsoft] Operation canceled";
  const string c_state = "U00000";
  const auto last = make_shared<OdbcError>(c_state.c_str(), c_msg.c_str(), 0, 0, "", "", 0);
  _errors->push_back(last);
  return true;
}

bool OdbcStatementLegacy::cancel_handle() {
  if (!_statement) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] cancel_handle: no statement");
    return false;
  }
  const auto& hnd = *_statement;
  const auto ret2 = _odbcApi->SQLCancelHandle(SQL_HANDLE_STMT, hnd.get_handle());

  if (ret2 == SQL_SUCCESS_WITH_INFO) {
    return_odbc_error();
    _resultset->_end_of_rows = false;
    _resultset->_end_of_results = true;
  }

  else if (!check_odbc_error(ret2)) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] cancel_handle failed to cancel handle");
    return false;
  }

  {
    lock_guard<recursive_mutex> lock(g_i_mutex);
    _cancelRequested.store(false);
  }
  // set_state(OdbcStatementState::STATEMENT_CANCELLED);
  return true;
}

bool OdbcStatementLegacy::try_execute_direct(const shared_ptr<QueryOperationParams>& q,
                                             const shared_ptr<BoundDatumSet>& param_set) {
  if (!_statement) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] try_execute_direct: no statement");
    return false;
  }

  // cout << "id " << _statementId << " try_execute_direct" << endl;
  _errors->clear();
  _errorHandler->ClearErrors();
  _pendingMoreResults.reset();
  _query = q;

  const auto timeout = q->timeout;
  auto& pars = *param_set;

  if (pars.size() > 0) {
    const auto& first = param_set->atIndex(0);
    if (first->is_bcp) {
      SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] try_execute_direct: trying bcp version "
                               << first->bcp_version);
      return try_bcp(param_set, first->bcp_version);
    }
  }
  const bool polling_mode = get_polling();
  {
    lock_guard<recursive_mutex> lock(g_i_mutex);
    set_state(OdbcStatementState::STATEMENT_BINDING);
    // Initialize _resultset before bind_params to ensure it's always available
    _resultset = make_unique<ResultSet>(0);

    const auto bound = bind_params(param_set);
    if (!bound) {
      // error already set in BindParams
      _resultset->_end_of_rows = true;
      _resultset->_end_of_results = true;
      // When binding fails, we need to ensure the statement will be freed
      // The JS layer should handle this via the error callback
      SQL_LOG_DEBUG_STREAM("[" << _handle.toString()
                               << "] bind_params failed, statement needs cleanup");
      return false;
    }
    // output params are read by Unbind() when the batch ends, which can be after an error
    _boundParamsSet = param_set;
    _resultset->_end_of_results = true;  // reset
    const auto ret = query_timeout(timeout);
    if (!check_odbc_error(ret)) {
      SQL_LOG_DEBUG_STREAM("[" << _handle.toString()
                               << "] try_execute_direct failed to set stmt attr");
      return false;
    }

    if (polling_mode) {
      auto ret = _odbcApi->SQLSetStmtAttr(_statement->get_handle(),
                                          SQL_ATTR_ASYNC_ENABLE,
                                          reinterpret_cast<SQLPOINTER>(SQL_ASYNC_ENABLE_ON),
                                          0);
      if (!check_odbc_error(ret)) {
        SQL_LOG_DEBUG_STREAM("[" << _handle.toString()
                                 << "] try_execute_direct failed to set stmt attr");
        return false;
      }
    }
  }
  auto query = q->query_string;

  set_state(OdbcStatementState::STATEMENT_SUBMITTED);
  SQLRETURN ret = _odbcApi->SQLExecDirect(
      _statement->get_handle(), reinterpret_cast<SQLWCHAR*>(query.data()), query.size());
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
    ret = poll_check(ret, make_shared<vector<uint16_t>>(query.begin(), query.end()), true);
  }

  if (ret == SQL_NO_DATA) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] try_execute_direct SQL_NO_DATA " << ret);
    start_reading_results();
    if (!_resultset) {
      _resultset = make_unique<ResultSet>(0);
    }
    _resultset->_end_of_rows = true;
    return true;
  }

  if (!SQL_SUCCEEDED(ret)) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString()
                             << "]  try_execute_direct failed to execute: " << ret);
    // cerr << "SQL_SUCCEEDED = " << ret << endl;
    return_odbc_error();
    if (!_resultset) {
      _resultset = make_unique<ResultSet>(0);
    }
    _resultset->_end_of_rows = true;
    _resultset->_end_of_results = !look_ahead_after_error();
    return false;
  }

  if (ret == SQL_SUCCESS_WITH_INFO) {
    SQL_LOG_DEBUG_STREAM("[" << _handle.toString() << "] try_execute_direct SQL_SUCCESS_WITH_INFO "
                             << ret);
    return_odbc_error();
    _boundParamsSet = param_set;
    if (start_reading_results()) {
      _resultset->_end_of_rows = false;
    } else {
      if (!_resultset) {
        _resultset = make_unique<ResultSet>(0);
      }
      _resultset->_end_of_rows = true;
    }
    // cout << "id " << _statementId << "SQL_SUCCESS_WITH_INFO = " << ret << endl;
    return false;
  }
  _boundParamsSet = param_set;
  // cout << "id " << _statementId << " start_reading_results ret " << ret << endl;
  return start_reading_results();
}

bool OdbcStatementLegacy::try_read_next_result() {
  if (!_statement) {
    SQL_LOG_DEBUG_STREAM("OdbcStatementLegacy::try_read_next_result ["
                         << _handle.toString() << "] try_read_next_result no statement");
    return false;
  }
  // fprintf(stderr, "TryReadNextResult\n");
  // fprintf(stderr, "TryReadNextResult ID = %llu\n ", get_statement_id());
  const auto state = get_state();
  if (state == OdbcStatementState::STATEMENT_CANCELLED ||
      state == OdbcStatementState::STATEMENT_CANCEL_HANDLE || _cancelHandleIssued.load()) {
    // a cancel that landed between calls: end the query as the cancel it is (HY008)
    return return_cancelled();
  }
  const auto& statement = *_statement;
  const auto ret = _pendingMoreResults ? *_pendingMoreResults
                                       : _odbcApi->SQLMoreResults(statement.get_handle());
  _pendingMoreResults.reset();
  switch (ret) {
    case SQL_NO_DATA: {
      SQL_LOG_DEBUG_STREAM("OdbcStatementLegacy::try_read_next_result ["
                           << _handle.toString() << "] try_read_next_result SQL_NO_DATA " << ret);
      keep_diagnostics();
      _resultset->_end_of_results = true;
      _resultset->_end_of_rows = true;
      if (_prepared) {
        _odbcApi->SQLCloseCursor(statement.get_handle());
      }
      return true;
    }

    case SQL_SUCCESS_WITH_INFO: {
      SQL_LOG_DEBUG_STREAM("OdbcStatementLegacy::try_read_next_result ["
                           << _handle.toString() << "] try_read_next_result SQL_SUCCESS_WITH_INFO "
                           << ret);
      return_odbc_error();
      const auto res = read_next_result_columns();
      if (res) {
        _resultset->_end_of_rows = false;
      } else {
        _resultset->_end_of_rows = true;
      }
      return false;
    }

    case SQL_ERROR: {
      // Issue #396: when a batch contains an info message (PRINT) or a prior
      // result set followed by THROW/RAISERROR, SQLMoreResults surfaces the
      // server error here. We must capture the diagnostic record immediately;
      // any subsequent ODBC call against the statement (e.g. SQLNumResultCols
      // via start_reading_results) will fail with HY007 "Associated statement
      // is not prepared" and overwrite the diag rec, swallowing the real
      // error.
      SQL_LOG_DEBUG_STREAM("OdbcStatementLegacy::try_read_next_result ["
                           << _handle.toString()
                           << "] try_read_next_result SQL_ERROR from SQLMoreResults");
      // don't read this result's columns (that is what fails with HY007), but the
      // statements after the failed one may still have results to move on to.
      return_odbc_error();
      _resultset = make_unique<ResultSet>(0);
      _resultset->_end_of_results = !look_ahead_after_error();
      _resultset->_end_of_rows = true;
      return false;
    }
    default:;
  }
  _resultset->_end_of_results = false;
  return read_next_result_columns();
}

// the columns of the result the statement has moved on to. a prepared statement reads its
// rows through bound storage, which is the last result's until bound again for this one
bool OdbcStatementLegacy::read_next_result_columns() {
  if (!start_reading_results()) {
    return false;
  }
  if (!_prepared) {
    return true;
  }
  _boundToFirstResult = false;
  return bind_prepared_storage();
}
}  // namespace mssql
