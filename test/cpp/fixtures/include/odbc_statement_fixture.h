// test/fixtures/include/odbc_statement_fixture.h
#pragma once

#include <gtest/gtest.h>
#include <gmock/gmock.h>
#include "mock_odbc_api.h"
#include "mock_odbc_statement.h"


namespace mssql
{
    namespace test
    {
        class OdbcStatementFixture : public ::testing::Test
        {
        protected:
            void SetUp() override;

            std::shared_ptr<::testing::NiceMock<MockOdbcStatementHandle>> mockStmtHandle;
            std::shared_ptr<::testing::NiceMock<MockOdbcErrorHandler>> mockErrorHandler;
            std::shared_ptr<::testing::StrictMock<MockOdbcApi>> mockOdbcApi;
            SQLHANDLE fakeHandle;
        };
    } // namespace test
} // namespace mssql