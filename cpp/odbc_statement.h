#pragma once

#include <memory>
#include <string>
#include <vector>
#include "odbc_handles.h"
#include "query_parameter.h"
#include "query_result.h"

namespace mssql
{
  class OdbcErrorHandler;

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

  protected:
    OdbcStatement(
        Type type,
        std::shared_ptr<IOdbcStatementHandle> statement,
        std::shared_ptr<OdbcErrorHandler> errorHandler)
        : type_(type), statement_(statement), errorHandler_(errorHandler)
    {
    }

    /**
     * @brief Process results from an executed statement
     * @param result The QueryResult object to store the results in
     * @return true if successful, false otherwise
     */
    bool ProcessResults(std::shared_ptr<QueryResult> &result);

    Type type_;
    std::shared_ptr<IOdbcStatementHandle> statement_;
    std::shared_ptr<OdbcErrorHandler> errorHandler_;
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
        const std::string &query);

    bool Execute(
        const std::vector<std::shared_ptr<QueryParameter>> &parameters,
        std::shared_ptr<QueryResult> &result) override;

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
        const std::string &query);

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
        const std::string &tvpType);

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

  /**
   * @brief Factory for creating statements
   */
  class StatementFactory
  {
  public:
    static std::shared_ptr<OdbcStatement> CreateStatement(
        OdbcStatement::Type type,
        std::shared_ptr<IOdbcStatementHandle> handle,
        std::shared_ptr<OdbcErrorHandler> errorHandler,
        const std::string &query,
        const std::string &tvpType = "");
  };
}