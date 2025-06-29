
#pragma once

#include <odbc/odbc_driver_types.h>
#include <memory>
#include <string>
#include <vector>
#include <atomic>

#include "odbc_common.h"
#include "odbc_driver_types.h"
#include "odbc_handles.h"
#include "query_parameter.h"
#include <js/columns/result_set.h>
#include <odbc/odbc_statement.h>
#include <odbc/odbc_state_notifier.h>

namespace mssql {
class BoundDatum;
class BoundDatumSet;
class DatumStorage;
class QueryOperationParams;
class OdbcError;

using namespace std;

class OdbcStatementLegacy : public IOdbcStatement {
 public:
  mutex _statement_mutex;

  void assign_result(std::shared_ptr<QueryResult>& result, std::shared_ptr<ResultSet> resultset);

  bool Execute(const std::shared_ptr<BoundDatumSet> parameters,
               std::shared_ptr<QueryResult>& result) override;

  bool Prepare(const std::shared_ptr<BoundDatumSet> parameters,
               std::shared_ptr<QueryResult>& result) override;

  bool BindExecute(const std::shared_ptr<BoundDatumSet> parameters,
                   std::shared_ptr<QueryResult>& result) override;

  std::shared_ptr<BoundDatumSet> Unbind() override;

  /**
   * @brief Get the statement type
   */
  StatementType GetType() const override;

  /**
   * @brief Get the native ODBC statement handle
   */
  SQLHSTMT GetHandle() const override;

  /**
   * @brief Get the statement handle (our wrapper type)
   */
  StatementHandle GetStatementHandle() const override;

  /**
   * @brief Check if numeric string mode is enabled
   */
  bool IsNumericStringEnabled() const override;

  /**
   * @brief Get the current state of the statement
   * @return Current state
   */
  OdbcStatementState GetState() const override;

  std::vector<std::shared_ptr<IOdbcRow>>& GetRows() override;
  std::shared_ptr<QueryResult> GetMetaData() override;
  bool TryReadRows(std::shared_ptr<QueryResult> result, const size_t number_rows) override;
  bool ReadNextResult(std::shared_ptr<QueryResult> result) override;

  std::shared_ptr<ResultSet> GetResultSet() override {
    return _resultset;
  }

  bool created() {
    return _statementState == OdbcStatementState::STATEMENT_CREATED;
  }
  bool Cancel() override;

  /**
   * @brief Close the statement and set CLOSED state
   */
  void Close() override {
    set_state(OdbcStatementState::STATEMENT_CLOSED);
  }

  /**
   * @brief Set the state change notifier
   * @param notifier The notifier to receive state change events
   */
  void SetStateNotifier(std::shared_ptr<IOdbcStateNotifier> notifier) override;

  OdbcStatementLegacy(std::shared_ptr<IOdbcConnectionHandle> connectionHandle,
                      std::shared_ptr<IOdbcStatementHandle> statement,
                      std::shared_ptr<OdbcErrorHandler> errorHandler,
                      std::shared_ptr<IOdbcApi> odbcApi,
                      StatementHandle handle,
                      const std::shared_ptr<QueryOperationParams> operationParams);
  virtual ~OdbcStatementLegacy();
  SQLLEN get_row_count() const {
    return _resultset != nullptr ? _resultset->row_count() : -1;
  }
  shared_ptr<ResultSet> get_result_set() const {
    return _resultset;
  }

  long get_statement_id() const {
    return _statementId;
  }

  bool is_prepared() const {
    return _prepared;
  }

  Napi::Array unbind_params(Napi::Env env) const;
  Napi::Object get_meta_value(Napi::Env env) const;
  bool end_of_results() const;
  Napi::Object handle_end_of_results(Napi::Env env) const;
  Napi::Object end_of_rows(Napi::Env env) const;
  bool set_polling(bool mode);
  bool get_polling();
  void set_state(const OdbcStatementState state);
  OdbcStatementState get_state();
  bool set_numeric_string(bool mode);

  shared_ptr<vector<shared_ptr<OdbcError>>> errors(void) const {
    return _errors;
  }

  bool try_prepare(const shared_ptr<QueryOperationParams>& q);
  bool bind_fetch(const shared_ptr<BoundDatumSet>& param_set);
  bool try_bcp(const shared_ptr<BoundDatumSet>& param_set, int32_t version);
  bool try_execute_direct(const shared_ptr<QueryOperationParams>& q,
                          const shared_ptr<BoundDatumSet>& paramSet);
  bool cancel_handle();
  bool try_read_columns(size_t number_rows);
  bool try_read_next_result();
  void done() {
    _statementState = OdbcStatementState::STATEMENT_CLOSED;
  }

 private:
  bool fetch_read(const size_t number_rows);
  bool prepared_read();
  SQLRETURN poll_check(SQLRETURN ret, shared_ptr<vector<uint16_t>> vec, const bool direct);
  bool get_data_binary(size_t row_id, size_t column);
  bool get_data_decimal(size_t row_id, size_t column);
  bool get_data_numeric(size_t row_id, size_t column);
  bool get_data_bit(size_t row_id, size_t column);
  bool get_data_timestamp(size_t row_id, size_t column);
  bool get_data_long(size_t row_id, size_t column);
  bool get_data_tiny(size_t row_id, size_t column);
  bool get_data_big_int(size_t row_id, size_t column);
  bool get_data_timestamp_offset(size_t row_id, size_t column);

  bool start_reading_results();
  SQLRETURN query_timeout(int timeout);
  bool d_variant(size_t row_id, size_t column);
  bool d_time(size_t row_id, size_t column);
  bool bounded_string(SQLLEN display_size, size_t row, size_t column);
  bool reserved_chars(const size_t row_count, const size_t column_size, size_t const column) const;
  bool reserved_string(const size_t row_count, const size_t column_size, const int column) const;
  bool reserved_binary(const size_t row_count, const size_t column_size, const int column) const;
  bool reserved_bit(const size_t row_count, const size_t column) const;
  bool reserved_int(const size_t row_count, const size_t column) const;
  bool reserved_big_int(const size_t row_count, const size_t column) const;
  bool reserved_decimal(const size_t row_count, const size_t column) const;
  bool reserved_time(const size_t row_count, const size_t column) const;
  bool reserved_timestamp(const size_t row_count, const size_t column) const;
  bool reserved_timestamp_offset(const size_t row_count, const size_t column) const;
  bool apply_precision(const shared_ptr<BoundDatum>& datum, int current_param);
  bool read_col_attributes(ColumnDefinition& current, int column);
  bool read_next(int column);
  bool raise_cancel();
  bool check_more_read(SQLRETURN r, bool& status);
  bool lob(size_t, size_t column);
  bool dispatch(SQLSMALLINT t, size_t row, size_t column);
  bool dispatch_prepared(const SQLSMALLINT t,
                         const size_t column_size,
                         const size_t rows_count,
                         const size_t column) const;
  typedef vector<shared_ptr<BoundDatum>> param_bindings;
  typedef pair<int, shared_ptr<param_bindings>> tvp_t;
  bool bind_tvp(vector<tvp_t>& tvps);
  bool bind_datum(int current_param, const shared_ptr<BoundDatum>& datum);
  bool bind_params(const shared_ptr<BoundDatumSet>& params);
  void queue_tvp(int current_param,
                 param_bindings::iterator& itr,
                 shared_ptr<BoundDatum>& datum,
                 vector<tvp_t>& tvps);
  bool try_read_string(bool binary, size_t row_id, size_t column);

  bool return_odbc_error();
  bool check_odbc_error(SQLRETURN ret);

  shared_ptr<QueryOperationParams> _query;

  // any error that occurs when a Try* function returns false is stored here
  // and may be retrieved via the Error function below.

  shared_ptr<vector<shared_ptr<OdbcError>>> _errors;

  // bool _endOfResults;
  long _statementId;
  bool _prepared;
  std::atomic<bool> _cancelRequested;
  std::atomic<bool> _pollingEnabled;
  bool _numericStringEnabled;

  std::atomic<OdbcStatementState> _statementState{OdbcStatementState::STATEMENT_IDLE};

  // set binary true if a binary Buffer should be returned instead of a JS string

  std::shared_ptr<ResultSet> _resultset;
  std::shared_ptr<BoundDatumSet> _boundParamsSet;
  std::shared_ptr<BoundDatumSet> _preparedStorage;

  std::shared_ptr<IOdbcStatementHandle> _statement;
  std::shared_ptr<OdbcErrorHandler> _errorHandler;
  std::shared_ptr<IOdbcApi> _odbcApi;
  StatementHandle _handle;
  std::vector<std::shared_ptr<IOdbcRow>> _rows;
  std::shared_ptr<QueryOperationParams> _operationParams;
  recursive_mutex g_i_mutex;

  // State change notifier - store both the shared_ptr and weak wrapper
  std::shared_ptr<IOdbcStateNotifier> _stateNotifierShared;
  std::unique_ptr<WeakStateNotifier> _stateNotifier;

  const static size_t prepared_rows_to_bind = 50;
  std::shared_ptr<IOdbcConnectionHandle> _connectionHandle;
};

struct OdbcStatementGuard {
  OdbcStatementGuard(std::shared_ptr<OdbcStatementLegacy> statement) : _statement(statement) {
    if (!_statement)
      return;
    lock_guard<mutex> lock(_statement->_statement_mutex);
  }
  std::shared_ptr<OdbcStatementLegacy> _statement;
};
}  // namespace mssql