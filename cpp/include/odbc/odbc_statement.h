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
 * @brief Statement implementations the factory can create
 */
enum class StatementType {
  Legacy  // OdbcStatementLegacy, the only implementation
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

}  // namespace mssql