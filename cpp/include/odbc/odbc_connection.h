#pragma once

// Standard library includes
#include <string>
#include <vector>
#include <memory>
#include <mutex>
#include <unordered_map>
#include <atomic>
#include <utility>

// ODBC headers
#include <sql.h>
#include <sqlext.h>

// Project includes
#include "odbc_statement.h"
#include "odbc_error.h"
#include "odbc_query_executor.h"

namespace mssql
{
  // Forward declarations
  class OdbcError;
  class OdbcStatementCache;
  class QueryParameter;
  class QueryResult;
  class IOdbcApi;
  class OdbcQueryExecutor;
  class IOdbcEnvironmentHandle;
  class IOdbcConnectionHandle;
  class IOdbcStatementHandle;
  class ConnectionHandles;
  class OdbcErrorHandler;
  class OdbcStatement;
  class IOdbcEnvironment;
  class OdbcTransactionManager;
  class OdbcStatementFactory;

  class IOdbcConnection
  {
  public:
    virtual ~IOdbcConnection() = default;

    virtual bool Open(const std::string &connectionString, int timeout) = 0;
    virtual bool Close() = 0;
    virtual bool IsConnected() const = 0;

    virtual bool BeginTransaction() = 0;
    virtual bool CommitTransaction() = 0;
    virtual bool RollbackTransaction() = 0;

    // Statement management
    virtual std::shared_ptr<OdbcStatement> CreateStatement(
        OdbcStatement::Type type,
        const std::string &query,
        const std::string &tvpType = "") = 0;

    virtual std::shared_ptr<OdbcStatement> GetPreparedStatement(
        const std::string &statementId) = 0;

    virtual bool ReleasePreparedStatement(
        const std::string &statementId) = 0;

    // Legacy ExecuteQuery for backward compatibility
    virtual bool ExecuteQuery(
        const std::string &sqlText,
        const std::vector<std::shared_ptr<QueryParameter>> &parameters,
        std::shared_ptr<QueryResult> &result) = 0;

    virtual const std::vector<std::shared_ptr<OdbcError>> &GetErrors() const = 0;
  };

  // This class encapsulates the actual ODBC functionality
  class OdbcConnection : public IOdbcConnection
  {
  public:
    // Constructor now takes an environment parameter
    explicit OdbcConnection(
        std::shared_ptr<IOdbcEnvironment> environment = nullptr,
        std::shared_ptr<IOdbcApi> odbcApi = nullptr,
        int connectionId = -1);
    ~OdbcConnection() override;

    // Static method to initialize a shared ODBC environment (legacy compatibility)
    static bool InitializeEnvironment();

    // Open a connection to the database
    bool Open(const std::string &connectionString, int timeout = 0) override;
    bool Close() override;
    bool IsConnected() const override;

    // Begin a transaction
    bool BeginTransaction() override;

    // Commit a transaction
    bool CommitTransaction() override;

    // Rollback a transaction
    bool RollbackTransaction() override;

    // Statement management
    std::shared_ptr<OdbcStatement> CreateStatement(
        OdbcStatement::Type type,
        const std::string &query,
        const std::string &tvpType = "") override;

    std::shared_ptr<OdbcStatement> GetPreparedStatement(
        const std::string &statementId) override;

    bool ReleasePreparedStatement(
        const std::string &statementId) override;

    // Legacy ExecuteQuery implementation
    bool ExecuteQuery(
        const std::string &sqlText,
        const std::vector<std::shared_ptr<QueryParameter>> &parameters,
        std::shared_ptr<QueryResult> &result) override;

    // Get connection errors
    const std::vector<std::shared_ptr<OdbcError>> &GetErrors() const override;

  private:
    // Connection state enum
    enum ConnectionState
    {
      ConnectionClosed,
      ConnectionOpen
    };

    // Connection state
    ConnectionState connectionState;

    // Environment for this connection
    std::shared_ptr<IOdbcEnvironment> environment_;

    // Shared ODBC environment for backward compatibility
    static std::shared_ptr<IOdbcEnvironment> sharedEnvironment_;

    // Connection handles
    std::shared_ptr<ConnectionHandles> _connectionHandles;

    // Transaction manager
    std::shared_ptr<OdbcTransactionManager> _transactionManager;

    // Error handler
    std::shared_ptr<OdbcErrorHandler> _errorHandler;

    // Query executor
    std::shared_ptr<OdbcQueryExecutor> _queryExecutor;

    // Error collection
    std::shared_ptr<std::vector<std::shared_ptr<OdbcError>>> _errors;

    // Critical section for thread safety
    std::mutex _connectionMutex;

    // Additional member
    std::shared_ptr<IOdbcApi> _odbcApi;
    
    int _connectionId;

    std::shared_ptr<OdbcStatementFactory> _statementFactory;

    // Statement management
    std::unordered_map<std::string, std::shared_ptr<OdbcStatement>> _preparedStatements;
    std::mutex _statementMutex;

    // Helper methods
    bool TryClose();
    bool ReturnOdbcError();
    bool CheckOdbcError(SQLRETURN ret);
    SQLRETURN open_timeout(int timeout);
    bool try_open(std::shared_ptr<std::vector<uint16_t>> connection_string, int timeout);
    bool try_begin_tran();
    bool try_end_tran(SQLSMALLINT completion_type);

    // Convert UTF-8 connection string to UTF-16
    std::shared_ptr<std::vector<uint16_t>> ConvertConnectionString(const std::string &connectionString);
  };
}