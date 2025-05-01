#pragma once
#include <string>
#include <vector>
#include <memory>
#include <mutex>
#include <odbc_handles.h>
#include <odbc_common.h>
#include "odbc_environment.h"

namespace mssql
{
  // Forward declarations
  class OdbcError;
  class OdbcStatementCache;
  class QueryParameter;
  class QueryResult;

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
    explicit OdbcConnection(std::shared_ptr<IOdbcEnvironment> environment = nullptr);
    ~OdbcConnection();

    // Static method to initialize a shared ODBC environment (legacy compatibility)
    static bool InitializeEnvironment();

    // Open a connection to the database
    bool Open(const std::string &connectionString, int timeout = 0);
    bool ExecuteQuery(
        const std::string &sqlText,
        const std::vector<std::shared_ptr<QueryParameter>> &parameters,
        std::shared_ptr<QueryResult> &result);

    // Close the connection
    bool Close();

    // Check if the connection is open
    bool IsConnected() const;

    // Begin a transaction
    bool BeginTransaction();

    // Commit a transaction
    bool CommitTransaction();

    // Rollback a transaction
    bool RollbackTransaction();

    // Get connection errors
    const std::vector<std::shared_ptr<OdbcError>> &GetErrors() const;

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

    // Statement cache
    std::shared_ptr<OdbcStatementCache> _statements;

    // Error collection
    std::shared_ptr<std::vector<std::shared_ptr<OdbcError>>> _errors;

    // Critical section for thread safety
    std::mutex _connectionMutex;

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

  class OdbcConnectionFactory
  {
  public:
    static std::shared_ptr<IOdbcConnection> CreateConnection(
        std::shared_ptr<IOdbcEnvironment> environment = nullptr)
    {
      return std::make_shared<OdbcConnection>(environment);
    }
  };
}