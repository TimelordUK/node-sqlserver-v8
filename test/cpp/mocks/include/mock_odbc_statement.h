#pragma once

#include <gmock/gmock.h>
#include "mock_odbc_api.h"
#include "odbc_statement.h"
#include "odbc_handles.h"
#include "odbc_error_handler.h"

namespace mssql
{
  // Mock statement handle for testing
  class MockOdbcStatementHandle : public IOdbcStatementHandle
  {
  public:
    MOCK_METHOD(bool, alloc, (SQLHANDLE parent), (override));
    MOCK_METHOD(void, free, (), (override));
    MOCK_METHOD(void, read_errors, (std::shared_ptr<std::vector<std::shared_ptr<OdbcError>>> & errors), (const, override));
    MOCK_METHOD(SQLHANDLE, get_handle, (), (const, override));
  };

  // Mock error handler for testing
  class MockOdbcErrorHandler : public OdbcErrorHandler
  {
  public:
    explicit MockOdbcErrorHandler() : OdbcErrorHandler(nullptr) {}
    MOCK_METHOD(bool, CheckOdbcError, (SQLRETURN ret), (override));
    MOCK_METHOD(bool, ReturnOdbcError, (), (override));
    MOCK_METHOD(void, ClearErrors, (), (override));
    MOCK_METHOD(const std::vector<std::shared_ptr<OdbcError>> &, GetErrors, (), (const, override));
  };

  // Mock statement for testing
  class MockOdbcStatement : public OdbcStatement
  {
  public:
      MockOdbcStatement(
          Type type,
          std::shared_ptr<IOdbcStatementHandle> statement,
          std::shared_ptr<OdbcErrorHandler> errorHandler,
          std::shared_ptr<IOdbcApi> odbcApi = nullptr)
          : OdbcStatement(type, statement, errorHandler, odbcApi ? odbcApi : std::make_shared<MockOdbcApi>())
      {
      }
      MOCK_METHOD(bool, Execute, (const std::vector<std::shared_ptr<QueryParameter>>& parameters, std::shared_ptr<QueryResult>& result), (override));
  };

  // Mock statement factory for testing
  class MockStatementFactory
  {
  public:
    MOCK_METHOD(std::shared_ptr<OdbcStatement>, CreateStatement,
                (OdbcStatement::Type type,
                 std::shared_ptr<IOdbcStatementHandle> handle,
                 std::shared_ptr<OdbcErrorHandler> errorHandler,
                 const std::string &query,
                 const std::string &tvpType));
  };
}