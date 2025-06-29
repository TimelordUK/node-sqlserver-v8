#pragma once

// Standard library includes
#include <atomic>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

// ODBC headers
#include <sql.h>
#include <sqlext.h>

// Project includes
#include "odbc/odbc_error.h"
#include "odbc/odbc_statement.h"

namespace mssql {
// Forward declarations
class OdbcError;
class OdbcStatementCache;
class QueryParameter;
class QueryResult;
class IOdbcApi;
class OdbcQueryExecutor;
class IOdbcEnvironmentHandle;
class IOdbcConnectionHandle;
class BoundDatumSet;
class IOdbcStatementHandle;
class ConnectionHandles;
class OdbcErrorHandler;
class OdbcStatement;
class IOdbcEnvironment;
class OdbcTransactionManager;
class OdbcStatementFactory;

class IOdbcConnection {
 public:
  virtual ~IOdbcConnection() = default;

  virtual bool Open(const std::u16string& connectionString, int timeout) = 0;
  virtual bool Close() = 0;
  virtual bool IsConnected() const = 0;

  virtual bool BeginTransaction() = 0;
  virtual bool CommitTransaction() = 0;
  virtual bool RollbackTransaction() = 0;

  // Statement management
  virtual std::shared_ptr<IOdbcStatement> CreateStatement(
      StatementType type, const std::shared_ptr<QueryOperationParams> operationParam) = 0;

  virtual std::shared_ptr<IOdbcStatement> GetStatement(int statementId) const = 0;

  // Remove a statement and free its resources
  virtual bool RemoveStatement(int statementId) = 0;
  virtual bool CancelStatement(int statementId) = 0;
  virtual std::shared_ptr<BoundDatumSet> UnbindStatement(int statementId) = 0;

  // Legacy ExecuteQuery for backward compatibility
  virtual bool ExecuteQuery(const std::shared_ptr<QueryOperationParams> operationParams,
                            const std::shared_ptr<BoundDatumSet> parameters,
                            std::shared_ptr<QueryResult>& result,
                            std::shared_ptr<IOdbcStateNotifier> stateNotifier = nullptr) = 0;

  virtual bool PrepareQuery(const std::shared_ptr<QueryOperationParams> operationParams,
                            const std::shared_ptr<BoundDatumSet> parameters,
                            std::shared_ptr<QueryResult>& result,
                            std::shared_ptr<IOdbcStateNotifier> stateNotifier = nullptr) = 0;

  virtual bool BindQuery(int statementId,
                         const std::shared_ptr<BoundDatumSet> parameters,
                         std::shared_ptr<QueryResult>& result) = 0;

  virtual const std::vector<std::shared_ptr<OdbcError>>& GetErrors() const = 0;

  virtual bool TryReadNextResult(int statementId, std::shared_ptr<QueryResult>& result) = 0;
};

// This class encapsulates the actual ODBC functionality
class OdbcConnection : public IOdbcConnection {
 public:
  // Constructor now takes an environment parameter
  explicit OdbcConnection(std::shared_ptr<IOdbcEnvironment> environment = nullptr,
                          std::shared_ptr<IOdbcApi> odbcApi = nullptr,
                          int connectionId = -1);
  ~OdbcConnection() override;

  // Static method to initialize a shared ODBC environment (legacy compatibility)
  static bool InitializeEnvironment(std::shared_ptr<IOdbcApi> odbcApiPtr);

  // Open a connection to the database
  bool Open(const std::u16string& connectionString, int timeout = 0) override;
  bool Close() override;
  bool IsConnected() const override;

  // Begin a transaction
  bool BeginTransaction() override;

  // Commit a transaction
  bool CommitTransaction() override;

  // Rollback a transaction
  bool RollbackTransaction() override;
  std::shared_ptr<IOdbcStatement> GetStatement(int statementId) const override;
  // Get the statement factory

  // Statement management
  std::shared_ptr<IOdbcStatement> CreateStatement(
      StatementType type, const std::shared_ptr<QueryOperationParams> operationParam) override;

  bool RemoveStatement(int statementId) override;
  bool CancelStatement(int statementId) override;
  std::shared_ptr<BoundDatumSet> UnbindStatement(int statementId) override;
  bool RemoveStatement(const std::shared_ptr<OdbcStatement>& statement);

  // Legacy ExecuteQuery implementation
  bool ExecuteQuery(const std::shared_ptr<QueryOperationParams> operationParams,
                    const std::shared_ptr<BoundDatumSet> parameters,
                    std::shared_ptr<QueryResult>& result,
                    std::shared_ptr<IOdbcStateNotifier> stateNotifier = nullptr) override;

  bool PrepareQuery(const std::shared_ptr<QueryOperationParams> operationParams,
                    const std::shared_ptr<BoundDatumSet> parameters,
                    std::shared_ptr<QueryResult>& result,
                    std::shared_ptr<IOdbcStateNotifier> stateNotifier = nullptr) override;

  bool BindQuery(int statementId,
                 const std::shared_ptr<BoundDatumSet> parameters,
                 std::shared_ptr<QueryResult>& result) override;

  bool TryReadNextResult(int statementId, std::shared_ptr<QueryResult>& result) override;

  // Get connection errors
  const std::vector<std::shared_ptr<OdbcError>>& GetErrors() const override;

 private:
  // Connection state enum
  enum ConnectionState {
    ConnectionClosed,
    ConnectionOpen,
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
  std::mutex _statementMutex;

  // Helper methods
  bool TryClose();
  bool ReturnOdbcError();
  bool CheckOdbcError(SQLRETURN ret);
  SQLRETURN open_timeout(int timeout);
  bool try_open(const std::u16string& connection_string, int timeout);
  bool try_begin_tran();
  bool try_end_tran(SQLSMALLINT completion_type);
  std::unordered_map<int, StatementHandle> _queryIdToStatementHandle;
};
}  // namespace mssql