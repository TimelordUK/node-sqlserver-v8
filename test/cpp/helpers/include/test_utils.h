// test/helpers/include/test_utils.h
#pragma once

#include "test_helper_exports.h"
#include <memory>
#include <sqlext.h>
#include <gmock/gmock.h>
#include "test_data_builder.h"
#include "mock_odbc_api.h"
#include "mock_odbc_statement.h"
// #include "mock_odbc_error_handler.h"

namespace mssql
{
  namespace test
  {

    // Helper function to set up all the common mock expectations for ODBC testing
    TEST_HELPER_API void setupOdbcMockExpectations(
        std::shared_ptr<::testing::NiceMock<MockOdbcStatementHandle>> &mockStmtHandle,
        std::shared_ptr<::testing::NiceMock<MockOdbcErrorHandler>> &mockErrorHandler,
        std::shared_ptr<::testing::StrictMock<MockOdbcApi>> &mockOdbcApi,
        SQLHANDLE fakeHandle,
        const std::vector<TestDataBuilder::ColumnDefinition> &columnDefs,
        const std::vector<std::vector<std::string>> &rows);

    // Factory methods for test data
    TEST_HELPER_API TestDataBuilder createEmployeeTestData();
    TEST_HELPER_API TestDataBuilder createProductTestData();

  } // namespace test
} // namespace mssql