// test/fixtures/src/odbc_statement_fixture.cpp
#include "platform.h"
#include "odbc_common.h"
#include "odbc_statement_fixture.h"
#include "test_data_builder.h"

using ::testing::_;
using ::testing::NiceMock;
using ::testing::Return;
using ::testing::StrictMock;

namespace mssql {
    namespace test {
        void OdbcStatementFixture::SetUp() {
            mockStmtHandle = std::make_shared<NiceMock<MockOdbcStatementHandle>>();
            mockErrorHandler = std::make_shared<NiceMock<MockOdbcErrorHandler>>();
            mockOdbcApi = std::make_shared<StrictMock<MockOdbcApi>>();

            // Use a consistent fake handle
            fakeHandle = reinterpret_cast<SQLHANDLE>(0x12345678);

            // Set up default behavior
            ON_CALL(*mockStmtHandle, get_handle())
                .WillByDefault(Return(fakeHandle));
            ON_CALL(*mockStmtHandle, alloc(_))
                .WillByDefault(Return(true));
            ON_CALL(*mockErrorHandler, CheckOdbcError(_))
                .WillByDefault(Return(true));
            ON_CALL(*mockErrorHandler, ReturnOdbcError())
                .WillByDefault(Return(false));
        }

        // Remove the duplicate factory methods - they're already defined in test_data_builder.cpp
    } // namespace test
} // namespace mssql