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

  /**
   * @brief Base class for all ODBC statements
   */
  class OdbcStatement
  {
  public:
    enum class Type
    {
      Transient, // One-off query execution
      Prepared,  // Prepared statement that can be reused
      TVP        // Table-valued parameter statement
    };

    enum class State
    {
      STMT_NO_MORE_RESULTS, // No more result sets available
      STMT_METADATA_READY,  // Metadata for current result set is ready
      STMT_EXECUTING,       // Statement is executing
      STMT_FETCHING_ROWS,   // Currently fetching rows
      STMT_FETCH_COMPLETE,  // All rows in current result set have been fetched
      STMT_ERROR            // An error occurred
    };

    virtual ~OdbcStatement() = default;

    /**
     * @brief Execute the statement with given parameters
     */
    virtual bool Execute(
        const std::vector<std::shared_ptr<QueryParameter>> &parameters,
        std::shared_ptr<QueryResult> &result) = 0;

    /**
     * @brief Get the statement type
     */
    Type getType() const { return type_; }

    /**
     * @brief Get the statement handle
     */
    SQLHSTMT getHandle() const { return statement_->get_handle(); }

    StatementHandle getStatementHandle() { return handle_; }

    bool isNumericStringEnabled() const { return numericStringEnabled_; }

  protected:
    OdbcStatement(
        Type type,
        std::shared_ptr<IOdbcStatementHandle> statement,
        std::shared_ptr<OdbcErrorHandler> errorHandler,
        std::shared_ptr<IOdbcApi> odbcApi,
        StatementHandle handle)
        : type_(type), statement_(statement), errorHandler_(errorHandler), odbcApi_(odbcApi), handle_(handle)
    {
    }

    /**
     * @brief Process results from an executed statement
     * @param result The QueryResult object to store the results in
     * @return true if successful, false otherwise
     */
    bool ProcessResults(std::shared_ptr<QueryResult> &result);

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
    bool numericStringEnabled_ = false;
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
          query_(query),
          state_(State::STMT_NO_MORE_RESULTS),
          hasMoreResults_(false),
          endOfRows_(true)
    {
    }

    // Core operations only
    bool Execute(
        const std::vector<std::shared_ptr<QueryParameter>> &parameters,
        std::shared_ptr<QueryResult> &result) override;

    bool FetchNextBatch(size_t batchSize);
    bool NextResultSet();
    bool HasMoreResults() const;
    bool EndOfRows() const;
    State GetState() const;

  protected:
    bool GetMetadata(std::shared_ptr<QueryResult> &result);
    bool InitializeResultSet(std::shared_ptr<QueryResult> &result);

  private:
    std::string query_;
    State state_;
    bool hasMoreResults_;
    bool endOfRows_;
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
        : OdbcStatement(Type::Transient, statement, errorHandler, odbcApi, handle), query_(query)
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