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

  /**
   * @brief Mock implementation of IOdbcStatement for testing
   * This is a complete mock that implements the IOdbcStatement interface directly,
   * making it suitable for testing components that use the interface.
   */
  class MockIOdbcStatement : public IOdbcStatement
  {
  public:
    MockIOdbcStatement() 
    {
      // Default configuration for a mock statement
      ON_CALL(*this, GetStatementHandle)
          .WillByDefault(testing::Return(StatementHandle(1, 1)));
      
      ON_CALL(*this, GetType)
          .WillByDefault(testing::Return(StatementType::Transient));
      
      ON_CALL(*this, GetState)
          .WillByDefault(testing::Return(StatementState::STMT_INITIAL));
      
      ON_CALL(*this, IsNumericStringEnabled)
          .WillByDefault(testing::Return(false));
      
      ON_CALL(*this, HasMoreResults)
          .WillByDefault(testing::Return(false));
      
      ON_CALL(*this, EndOfRows)
          .WillByDefault(testing::Return(true));
    }
    
    // Required interface methods
    MOCK_METHOD(bool, Execute, (const std::vector<std::shared_ptr<QueryParameter>>& parameters, std::shared_ptr<QueryResult>& result), (override));
    MOCK_METHOD(StatementType, GetType, (), (const, override));
    MOCK_METHOD(SQLHSTMT, GetHandle, (), (const, override));
    MOCK_METHOD(StatementHandle, GetStatementHandle, (), (const, override));
    MOCK_METHOD(bool, IsNumericStringEnabled, (), (const, override));
    MOCK_METHOD(bool, FetchNextBatch, (size_t batchSize), (override));
    MOCK_METHOD(bool, NextResultSet, (), (override));
    MOCK_METHOD(bool, HasMoreResults, (), (const, override));
    MOCK_METHOD(bool, EndOfRows, (), (const, override));
    MOCK_METHOD(StatementState, GetState, (), (const, override));
    MOCK_METHOD(bool, TryReadRows, (std::shared_ptr<QueryResult> result, const size_t number_rows), (override));
    
    // Utility method to configure common expectations
    void ConfigureForSuccessfulQuery(const std::vector<ColumnDefinition>& columns, size_t rowCount = 10) 
    {
      // Configure Execute to succeed and setup the result
      ON_CALL(*this, Execute(testing::_, testing::_))
          .WillByDefault(testing::DoAll(
              testing::Invoke([columns, rowCount](auto&, std::shared_ptr<QueryResult>& result) {
                  // Setup columns
                  for (const auto& col : columns) {
                      result->addColumn(col);
                  }
                  // Set row count
                  result->set_row_count(rowCount);
                  // Set end_of_rows to false initially
                  result->set_end_of_rows(false);
                  return true;
              }), 
              testing::Return(true)));
      
      // Configure HasMoreResults and EndOfRows behavior
      ON_CALL(*this, HasMoreResults())
          .WillByDefault(testing::Return(false));
      
      // First call to EndOfRows returns false, subsequent calls return true
      bool endOfRowsCalled = false;
      ON_CALL(*this, EndOfRows())
          .WillByDefault(testing::Invoke([&endOfRowsCalled]() {
              if (!endOfRowsCalled) {
                  endOfRowsCalled = true;
                  return false;
              }
              return true;
          }));
      
      // Configure TryReadRows to succeed
      ON_CALL(*this, TryReadRows(testing::_, testing::_))
          .WillByDefault(testing::DoAll(
              testing::Invoke([rowCount](std::shared_ptr<QueryResult> result, size_t) {
                  // Mark as end of rows after reading
                  result->set_end_of_rows(true);
                  return true;
              }),
              testing::Return(true)));
    }
  };

  // Existing mock that inherits from OdbcStatement (backwards compatibility)
  class MockOdbcStatement : public OdbcStatement
  {
  public:
      MockOdbcStatement(
          Type type,
          std::shared_ptr<IOdbcStatementHandle> statement,
          std::shared_ptr<OdbcErrorHandler> errorHandler,
          std::shared_ptr<IOdbcApi> odbcApi = nullptr)
          : OdbcStatement(type, statement, errorHandler, odbcApi ? odbcApi : std::make_shared<MockOdbcApi>(), StatementHandle())
      {
      }
      MOCK_METHOD(bool, Execute, (const std::vector<std::shared_ptr<QueryParameter>>& parameters, std::shared_ptr<QueryResult>& result), (override));
      // Add missing overrides from IOdbcStatement interface
      MOCK_METHOD(bool, FetchNextBatch, (size_t batchSize), (override));
      MOCK_METHOD(bool, NextResultSet, (), (override)); 
      MOCK_METHOD(bool, TryReadRows, (std::shared_ptr<QueryResult> result, const size_t number_rows), (override));
  };

  // Mock statement factory for testing (updated to use IOdbcStatement)
  class MockStatementFactory
  {
  public:
    MOCK_METHOD(std::shared_ptr<IOdbcStatement>, CreateStatement,
                (StatementType type,
                 std::shared_ptr<IOdbcStatementHandle> handle,
                 std::shared_ptr<OdbcErrorHandler> errorHandler,
                 const std::string &query,
                 const std::string &tvpType));
  };
}