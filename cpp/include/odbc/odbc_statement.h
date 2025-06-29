#pragma once

#include <atomic>
#include <memory>
#include <string>
#include <vector>

#include "odbc_common.h"
#include "odbc_driver_types.h"
#include "odbc_handles.h"
#include "query_parameter.h"
#include "js/columns/result_set.h"
#include "odbc_state_notifier.h"

namespace mssql {
class OdbcErrorHandler;
class IOdbcApi;
class QueryResult;
class IOdbcRow;
class BoundDatumSet;

/**
 * @brief Common statement types for OdbcStatement
 */
enum class StatementType {
  Legacy,     // Legacy statement that uses the old ODBC API
  Transient,  // One-off query execution
  Prepared,   // Prepared statement that can be reused
  TVP         // Table-valued parameter statement
};

/**
 * @brief Common statement states for OdbcStatement
 */
enum class OdbcStatementState {
  STATEMENT_CREATED = 1,
  STATEMENT_PREPARED = 2,
  STATEMENT_SUBMITTED = 3,
  STATEMENT_READING = 4,
  STATEMENT_CANCEL_HANDLE = 5,
  STATEMENT_CANCELLED = 6,
  STATEMENT_ERROR = 7,
  STATEMENT_CLOSED = 8,
  STATEMENT_BINDING = 9,
  STATEMENT_POLLING = 10,
  STATEMENT_IDLE = 11,
};

/**
 * @brief Convert OdbcStatementState enum to string for logging
 * @param state The state to convert
 * @return String representation of the state
 */
inline std::string OdbcStatementStateToString(OdbcStatementState state) {
  switch (state) {
    case OdbcStatementState::STATEMENT_CREATED:
      return "STATEMENT_CREATED";
    case OdbcStatementState::STATEMENT_PREPARED:
      return "STATEMENT_PREPARED";
    case OdbcStatementState::STATEMENT_SUBMITTED:
      return "STATEMENT_SUBMITTED";
    case OdbcStatementState::STATEMENT_READING:
      return "STATEMENT_READING";
    case OdbcStatementState::STATEMENT_CANCEL_HANDLE:
      return "STATEMENT_CANCEL_HANDLE";
    case OdbcStatementState::STATEMENT_CANCELLED:
      return "STATEMENT_CANCELLED";
    case OdbcStatementState::STATEMENT_ERROR:
      return "STATEMENT_ERROR";
    case OdbcStatementState::STATEMENT_CLOSED:
      return "STATEMENT_CLOSED";
    case OdbcStatementState::STATEMENT_BINDING:
      return "STATEMENT_BINDING";
    case OdbcStatementState::STATEMENT_POLLING:
      return "STATEMENT_POLLING";
    case OdbcStatementState::STATEMENT_IDLE:
      return "STATEMENT_IDLE";
    default:
      return "UNKNOWN_STATE";
  }
}

class BoundDatumSet;
/**
 * @brief Interface for ODBC statements
 * This allows for easier mocking in tests
 */
class IOdbcStatement {
 public:
  virtual ~IOdbcStatement() = default;

  /**
   * @brief Execute the statement with given parameters
   */
  virtual bool Execute(const std::shared_ptr<BoundDatumSet> parameters,
                       std::shared_ptr<QueryResult>& result) = 0;

  /**
   * @brief Prepare the statement with given parameters
   */
  virtual bool Prepare(const std::shared_ptr<BoundDatumSet> parameters,
                       std::shared_ptr<QueryResult>& result) = 0;

  /**
   * @brief Bind the statement with given parameters
   */
  virtual bool BindExecute(const std::shared_ptr<BoundDatumSet> parameters,
                           std::shared_ptr<QueryResult>& result) = 0;

  /**
   * @brief Unbind the statement
   */
  virtual std::shared_ptr<BoundDatumSet> Unbind() = 0;

  /**
   * @brief Get the statement type
   */
  virtual StatementType GetType() const = 0;

  /**
   * @brief Get the native ODBC statement handle
   */
  virtual SQLHSTMT GetHandle() const = 0;

  /**
   * @brief Get the statement handle (our wrapper type)
   */
  virtual StatementHandle GetStatementHandle() const = 0;

  /**
   * @brief Check if numeric string mode is enabled
   */
  virtual bool IsNumericStringEnabled() const = 0;

  /**
   * @brief Get the current state of the statement
   * @return Current state
   */
  virtual OdbcStatementState GetState() const = 0;

  virtual std::vector<std::shared_ptr<IOdbcRow>>& GetRows() = 0;
  virtual std::shared_ptr<QueryResult> GetMetaData() = 0;
  virtual std::shared_ptr<ResultSet> GetResultSet() = 0;

  /**
   * @brief Try to read rows from the result set
   * @param result Result object to store row data
   * @param number_rows Number of rows to read
   * @return true if successful, false otherwise
   */
  virtual bool TryReadRows(std::shared_ptr<QueryResult> result, const size_t number_rows) = 0;

  /**
   * @brief Read the next result
   * @param result Result object to store row data
   * @return true if successful, false otherwise
   */
  virtual bool ReadNextResult(std::shared_ptr<QueryResult> result) = 0;

  virtual bool Cancel() = 0;

  /**
   * @brief Close the statement and set CLOSED state
   */
  virtual void Close() = 0;

  /**
   * @brief Set the state change notifier
   * @param notifier The notifier to receive state change events
   */
  virtual void SetStateNotifier(std::shared_ptr<IOdbcStateNotifier> notifier) = 0;
};

/**
 * @brief Base implementation of IOdbcStatement
 */
class OdbcStatement : public IOdbcStatement {
 public:
  using Type = StatementType;
  using State = OdbcStatementState;

  virtual ~OdbcStatement() = default;

  /**
   * @brief Execute the statement with given parameters
   */
  virtual bool Execute(const std::shared_ptr<BoundDatumSet> parameters,
                       std::shared_ptr<QueryResult>& result) override = 0;

  /**
   * @brief Unbind the statement
   */
  std::shared_ptr<BoundDatumSet> Unbind() override = 0;

  /**
   * @brief Get the statement type
   */
  StatementType GetType() const override {
    return type_;
  }

  /**
   * @brief Get the statement handle
   */
  SQLHSTMT GetHandle() const override {
    return statement_->get_handle();
  }

  /**
   * @brief Get the statement handle (our wrapper type)
   */
  StatementHandle GetStatementHandle() const override {
    return handle_;
  }

  /**
   * @brief Check if numeric string mode is enabled
   */
  bool IsNumericStringEnabled() const override {
    return numericStringEnabled_;
  }

  /**
   * @brief Get the current state of the statement
   * @return Current state
   */
  OdbcStatementState GetState() const override {
    return state_.load();
  }

  /**
   * @brief Try to read rows from the result set
   * @param result Result object to store row data
   * @param number_rows Number of rows to read
   * @return true if successful, false otherwise
   */
  bool TryReadRows(std::shared_ptr<QueryResult> result, const size_t number_rows) override;

  std::vector<std::shared_ptr<IOdbcRow>>& GetRows() override {
    return rows_;
  }
  std::shared_ptr<QueryResult> GetMetaData() override {
    return metaData_;
  }

  std::shared_ptr<ResultSet> GetResultSet() override {
    return std::make_shared<ResultSet>(0);
  }

  /**
   * @brief Read the next result
   * @param result Result object to store row data
   * @return true if successful, false otherwise
   */
  bool ReadNextResult(std::shared_ptr<QueryResult> result) override;

  bool Cancel() override {
    return false;
  }

  /**
   * @brief Close the statement and set CLOSED state
   */
  void Close() override {
    SetState(State::STATEMENT_CLOSED);
  }

  /**
   * @brief Set the state change notifier
   * @param notifier The notifier to receive state change events
   */
  void SetStateNotifier(std::shared_ptr<IOdbcStateNotifier> notifier) override;

 protected:
  OdbcStatement(Type type,
                std::shared_ptr<IOdbcStatementHandle> statement,
                std::shared_ptr<OdbcErrorHandler> errorHandler,
                std::shared_ptr<IOdbcApi> odbcApi,
                StatementHandle handle)
      : type_(type),
        statement_(statement),
        errorHandler_(errorHandler),
        odbcApi_(odbcApi),
        handle_(handle),
        numericStringEnabled_(false),
        state_(State::STATEMENT_CREATED),
        hasMoreResults_(false),
        endOfRows_(true),
        errors_(new std::vector<std::shared_ptr<OdbcError>>()) {}

  // Legacy method for backward compatibility - delegates to TryReadRows
  bool try_read_rows(std::shared_ptr<QueryResult> result, const size_t number_rows);
  bool fetch_read(std::shared_ptr<QueryResult>, const size_t number_rows);
  bool check_odbc_error(const SQLRETURN ret);
  bool dispatch(const SQLSMALLINT t, const size_t row_id, const size_t column);
  bool get_data_long(const size_t row_id, const size_t column);
  bool get_data_small_int(const size_t row_id, const size_t column);
  bool get_data_int(const size_t row_id, const size_t column);
  bool get_data_tiny(const size_t row_id, const size_t column);
  bool get_data_big_int(const size_t row_id, const size_t column);
  bool get_data_decimal(const size_t row_id, const size_t column);
  bool get_data_bit(const size_t row_id, const size_t column);
  bool d_variant(const size_t row_id, const size_t column);
  bool bounded_string_wchar(const size_t display_size, const size_t row_id, const size_t column);
  bool bounded_string_char(const size_t display_size, const size_t row_id, const size_t column);
  bool try_read_string(const bool is_variant, const size_t row_id, const size_t column);

  // For backward compatibility
  bool bounded_string(const size_t display_size, const size_t row_id, const size_t column);
  bool lob(const size_t row_id, size_t column);
  bool get_data_binary(const size_t row_id, const size_t column);
  bool get_data_timestamp_offset(const size_t row_id, const size_t column);
  bool d_time(const size_t row_id, const size_t column);
  bool get_data_timestamp(const size_t row_id, const size_t column);
  bool bind_parameters(std::shared_ptr<BoundDatumSet> parameters);
  bool apply_precision(const std::shared_ptr<SqlParameter>& datum, const int current_param);

  Type type_;
  std::shared_ptr<IOdbcStatementHandle> statement_;
  std::shared_ptr<OdbcErrorHandler> errorHandler_;
  std::shared_ptr<IOdbcApi> odbcApi_;  // Added IOdbcApi reference
  StatementHandle handle_;
  bool numericStringEnabled_;
  std::atomic<State> state_;
  bool hasMoreResults_;
  bool endOfRows_;
  std::shared_ptr<QueryResult> metaData_;
  bool lob_wchar(const size_t row_id, size_t column);
  bool lob_char(const size_t row_id, size_t column);
  bool check_more_read(SQLRETURN r, bool& status);
  std::vector<std::shared_ptr<IOdbcRow>> rows_;
  std::shared_ptr<std::vector<shared_ptr<OdbcError>>> errors_;

  // State change notifier - store both the shared_ptr and weak wrapper
  std::shared_ptr<IOdbcStateNotifier> stateNotifierShared_;
  std::unique_ptr<WeakStateNotifier> stateNotifier_;

  // Helper method to set state with notification
  void SetState(State newState);
};

/**
 * @brief Transient statement for one-off query execution
 */
class TransientStatement : public OdbcStatement {
 public:
  TransientStatement(std::shared_ptr<IOdbcStatementHandle> statement,
                     std::shared_ptr<OdbcErrorHandler> errorHandler,
                     const std::shared_ptr<QueryOperationParams> operationParams,
                     std::shared_ptr<IOdbcApi> odbcApi,
                     StatementHandle handle)
      : OdbcStatement(Type::Transient, statement, errorHandler, odbcApi, handle),
        operationParams_(operationParams) {}

  std::shared_ptr<BoundDatumSet> Unbind() override {
    return nullptr;
  }

  // Core operations only
  bool Execute(const std::shared_ptr<BoundDatumSet> parameters,
               std::shared_ptr<QueryResult>& result) override;

  bool Prepare(const std::shared_ptr<BoundDatumSet> parameters,
               std::shared_ptr<QueryResult>& result) override;

  bool BindExecute(const std::shared_ptr<BoundDatumSet> parameters,
                   std::shared_ptr<QueryResult>& result) override;

  bool ReadNextResult(std::shared_ptr<QueryResult> result) override;

 protected:
  bool GetMetadata(std::shared_ptr<QueryResult>& result);
  bool InitializeResultSet(std::shared_ptr<QueryResult>& result);

 private:
  std::shared_ptr<QueryOperationParams> operationParams_;
};

/**
 * @brief Prepared statement that can be reused
 */
class PreparedStatement : public OdbcStatement {
 public:
  PreparedStatement(std::shared_ptr<IOdbcStatementHandle> statement,
                    std::shared_ptr<OdbcErrorHandler> errorHandler,
                    const std::shared_ptr<QueryOperationParams> operationParams,
                    std::shared_ptr<IOdbcApi> odbcApi,
                    StatementHandle handle)
      : OdbcStatement(Type::Prepared, statement, errorHandler, odbcApi, handle),
        operationParams_(operationParams) {}

  bool Execute(const std::shared_ptr<BoundDatumSet> parameters,
               std::shared_ptr<QueryResult>& result) override;
  bool Prepare(const std::shared_ptr<BoundDatumSet> parameters,
               std::shared_ptr<QueryResult>& result) override;
  bool BindExecute(const std::shared_ptr<BoundDatumSet> parameters,
                   std::shared_ptr<QueryResult>& result) override;

  std::shared_ptr<BoundDatumSet> Unbind() override {
    return nullptr;
  }

  bool Cancel() override {
    return false;
  }
  /**
   * @brief Prepare the statement
   */
  bool Prepare();

 private:
  std::shared_ptr<QueryOperationParams> operationParams_;
  bool isPrepared_ = false;
};

/**
 * @brief Table-valued parameter statement
 */
class TvpStatement : public OdbcStatement {
 public:
  TvpStatement(std::shared_ptr<IOdbcStatementHandle> statement,
               std::shared_ptr<OdbcErrorHandler> errorHandler,
               const std::shared_ptr<QueryOperationParams> operationParams,
               std::shared_ptr<IOdbcApi> odbcApi,
               StatementHandle handle)
      : OdbcStatement(Type::Transient, statement, errorHandler, odbcApi, handle),
        operationParams_(operationParams) {}

  bool Execute(const std::shared_ptr<BoundDatumSet> parameters,
               std::shared_ptr<QueryResult>& result) override;
  bool Prepare(const std::shared_ptr<BoundDatumSet> parameters,
               std::shared_ptr<QueryResult>& result) override;
  bool BindExecute(const std::shared_ptr<BoundDatumSet> parameters,
                   std::shared_ptr<QueryResult>& result) override;

  std::shared_ptr<BoundDatumSet> Unbind() override {
    return nullptr;
  }

  std::shared_ptr<ResultSet> GetResultSet() override {
    return std::make_shared<ResultSet>(0);
  }
  /**
   * @brief Bind TVP columns
   */
  bool BindTvpColumns(const std::vector<std::string>& columnNames);

  bool Cancel() override {
    return false;
  }

 private:
  std::shared_ptr<QueryOperationParams> operationParams_;
  bool isColumnsBound_ = false;
};

}  // namespace mssql