#pragma once

#include <memory>
#include <string>
#include <vector>
#include "odbc_handles.h"
#include "odbc_common.h"
#include "query_parameter.h"
#include "odbc_driver_types.h"

namespace mssql
{
  class OdbcErrorHandler;
  class IOdbcApi;
  class QueryResult;

  /**
   * @brief Common statement types for OdbcStatement
   */
  enum class StatementType
  {
    Transient, // One-off query execution
    Prepared,  // Prepared statement that can be reused
    TVP        // Table-valued parameter statement
  };

  /**
   * @brief Common statement states for OdbcStatement
   */
  enum class StatementState
  {
    STMT_INITIAL,
    STMT_PREPARED,
    STMT_SUBMITTED,
    STMT_READING,
    STMT_NO_MORE_RESULTS, // No more result sets available
    STMT_METADATA_READY,  // Metadata for current result set is ready
    STMT_EXECUTING,       // Statement is executing
    STMT_FETCHING_ROWS,   // Currently fetching rows
    STMT_FETCH_COMPLETE,  // All rows in current result set have been fetched
    STMT_ERROR            // An error occurred
  };

  /**
   * @brief Interface for ODBC statements
   * This allows for easier mocking in tests
   */
  class IOdbcStatement
  {
  public:
    virtual ~IOdbcStatement() = default;

    /**
     * @brief Execute the statement with given parameters
     */
    virtual bool Execute(
        const std::vector<std::shared_ptr<QueryParameter>> &parameters,
        std::shared_ptr<QueryResult> &result) = 0;

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
     * @brief Fetch the next batch of rows
     * @param batchSize Number of rows to fetch
     * @return true if successful, false otherwise
     */
    virtual bool FetchNextBatch(size_t batchSize) = 0;

    /**
     * @brief Move to the next result set, if any
     * @return true if there was another result set, false otherwise
     */
    virtual bool NextResultSet() = 0;

    /**
     * @brief Check if there are more result sets available
     * @return true if there are more result sets, false otherwise
     */
    virtual bool HasMoreResults() const = 0;

    /**
     * @brief Check if we've reached the end of rows in the current result set
     * @return true if no more rows, false otherwise
     */
    virtual bool EndOfRows() const = 0;

    /**
     * @brief Get the current state of the statement
     * @return Current state
     */
    virtual StatementState GetState() const = 0;

    /**
     * @brief Try to read rows from the result set
     * @param result Result object to store row data
     * @param number_rows Number of rows to read
     * @return true if successful, false otherwise
     */
    virtual bool TryReadRows(std::shared_ptr<QueryResult> result, const size_t number_rows) = 0;
  };

  /**
   * @brief Base implementation of IOdbcStatement
   */
  class OdbcStatement : public IOdbcStatement
  {
  public:
    using Type = StatementType;
    using State = StatementState;

    virtual ~OdbcStatement() = default;

    /**
     * @brief Execute the statement with given parameters
     */
    virtual bool Execute(
        const std::vector<std::shared_ptr<QueryParameter>> &parameters,
        std::shared_ptr<QueryResult> &result) override = 0;

    /**
     * @brief Get the statement type
     */
    StatementType GetType() const override { return type_; }

    /**
     * @brief Get the statement handle
     */
    SQLHSTMT GetHandle() const override { return statement_->get_handle(); }

    /**
     * @brief Get the statement handle (our wrapper type)
     */
    StatementHandle GetStatementHandle() const override { return handle_; }

    /**
     * @brief Check if numeric string mode is enabled
     */
    bool IsNumericStringEnabled() const override { return numericStringEnabled_; }

    /**
     * @brief Fetch the next batch of rows
     * @param batchSize Number of rows to fetch
     * @return true if successful, false otherwise
     */
    virtual bool FetchNextBatch(size_t batchSize) override;

    /**
     * @brief Move to the next result set, if any
     * @return true if there was another result set, false otherwise
     */
    virtual bool NextResultSet() override;

    /**
     * @brief Check if there are more result sets available
     * @return true if there are more result sets, false otherwise
     */
    virtual bool HasMoreResults() const override { return hasMoreResults_; }

    /**
     * @brief Check if we've reached the end of rows in the current result set
     * @return true if no more rows, false otherwise
     */
    virtual bool EndOfRows() const override { return endOfRows_; }

    /**
     * @brief Get the current state of the statement
     * @return Current state
     */
    virtual StatementState GetState() const override { return state_; }

    /**
     * @brief Try to read rows from the result set
     * @param result Result object to store row data
     * @param number_rows Number of rows to read
     * @return true if successful, false otherwise
     */
    virtual bool TryReadRows(std::shared_ptr<QueryResult> result, const size_t number_rows) override;

  protected:
    OdbcStatement(
        Type type,
        std::shared_ptr<IOdbcStatementHandle> statement,
        std::shared_ptr<OdbcErrorHandler> errorHandler,
        std::shared_ptr<IOdbcApi> odbcApi,
        StatementHandle handle)
        : type_(type), statement_(statement), errorHandler_(errorHandler), odbcApi_(odbcApi), handle_(handle),
          numericStringEnabled_(false), state_(State::STMT_INITIAL), hasMoreResults_(false), endOfRows_(true)
    {
    }

    /**
     * @brief Process results from an executed statement
     * @param result The QueryResult object to store the results in
     * @return true if successful, false otherwise
     */
    bool ProcessResults(std::shared_ptr<QueryResult> &result);

    // Legacy method for backward compatibility - delegates to TryReadRows
    bool try_read_rows(std::shared_ptr<QueryResult> result, const size_t number_rows);

    bool fetch_read(std::shared_ptr<QueryResult>, const size_t number_rows);
    bool check_odbc_error(const SQLRETURN ret);
    bool dispatch(const SQLSMALLINT t, const size_t row_id, const size_t column);
    bool get_data_long(const size_t row_id, const size_t column);
    bool get_data_big_int(const size_t row_id, const size_t column);
    bool get_data_decimal(const size_t row_id, const size_t column);
    bool get_data_bit(const size_t row_id, const size_t column);
    bool d_variant(const size_t row_id, const size_t column);
    bool try_read_string(const bool is_variant, const size_t row_id, const size_t column);
    bool get_data_binary(const size_t row_id, const size_t column);
    bool get_data_timestamp_offset(const size_t row_id, const size_t column);
    bool d_time(const size_t row_id, const size_t column);
    bool get_data_timestamp(const size_t row_id, const size_t column);

    Type type_;
    std::shared_ptr<IOdbcStatementHandle> statement_;
    std::shared_ptr<OdbcErrorHandler> errorHandler_;
    std::shared_ptr<IOdbcApi> odbcApi_; // Added IOdbcApi reference
    StatementHandle handle_;
    bool numericStringEnabled_;
    State state_;
    bool hasMoreResults_;
    bool endOfRows_;
    std::shared_ptr<QueryResult> metaData_;
  };

  /**
   * @brief Transient statement for one-off query execution
   */
  class TransientStatement : public OdbcStatement
  {
  public:
    TransientStatement(
        std::shared_ptr<IOdbcStatementHandle> statement,
        std::shared_ptr<OdbcErrorHandler> errorHandler,
        const std::string &query,
        std::shared_ptr<IOdbcApi> odbcApi,
        StatementHandle handle)
        : OdbcStatement(Type::Transient, statement, errorHandler, odbcApi, handle),
          query_(query)
    {
    }

    // Core operations only
    bool Execute(
        const std::vector<std::shared_ptr<QueryParameter>> &parameters,
        std::shared_ptr<QueryResult> &result) override;

    bool FetchNextBatch(size_t batchSize) override;
    bool NextResultSet() override;

  protected:
    bool GetMetadata(std::shared_ptr<QueryResult> &result);
    bool InitializeResultSet(std::shared_ptr<QueryResult> &result);

  private:
    std::string query_;
  };

  /**
   * @brief Prepared statement that can be reused
   */
  class PreparedStatement : public OdbcStatement
  {
  public:
    PreparedStatement(
        std::shared_ptr<IOdbcStatementHandle> statement,
        std::shared_ptr<OdbcErrorHandler> errorHandler,
        const std::string &query,
        std::shared_ptr<IOdbcApi> odbcApi,
        StatementHandle handle)
        : OdbcStatement(Type::Prepared, statement, errorHandler, odbcApi, handle), query_(query)
    {
    }

    bool Execute(
        const std::vector<std::shared_ptr<QueryParameter>> &parameters,
        std::shared_ptr<QueryResult> &result) override;

    /**
     * @brief Prepare the statement
     */
    bool Prepare();

  private:
    std::string query_;
    bool isPrepared_ = false;
  };

  /**
   * @brief Table-valued parameter statement
   */
  class TvpStatement : public OdbcStatement
  {
  public:
    TvpStatement(
        std::shared_ptr<IOdbcStatementHandle> statement,
        std::shared_ptr<OdbcErrorHandler> errorHandler,
        const std::string &query,
        const std::string &tvpType,
        std::shared_ptr<IOdbcApi> odbcApi,
        StatementHandle handle)
        : OdbcStatement(Type::Transient, statement, errorHandler, odbcApi, handle),
          query_(query), tvpType_(tvpType)
    {
    }

    bool Execute(
        const std::vector<std::shared_ptr<QueryParameter>> &parameters,
        std::shared_ptr<QueryResult> &result) override;

    /**
     * @brief Bind TVP columns
     */
    bool BindTvpColumns(const std::vector<std::string> &columnNames);

  private:
    std::string query_;
    std::string tvpType_;
    bool isColumnsBound_ = false;
  };

}