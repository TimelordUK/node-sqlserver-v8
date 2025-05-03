#include <gtest/gtest.h>
#include "datum_storage.h"
#include "time_utils.h"
#include "napi_wrapper.h"
#include "js_time_adapter.h"

using namespace mssql;

class JSTimeAdapterTest : public ::testing::Test {
protected:
    void SetUp() override {
        // This will be automatically called before each test
    }

    void TearDown() override {
        // This will be automatically called after each test
    }
};

TEST_F(JSTimeAdapterTest, DateBinding) {
    // Store the original implementation
    auto original = NapiWrapper::GetDateValueImpl;
    
    // Set up test date (January 15, 2023) as a static variable
    static double g_testDate = 1673740800000.0;
    
    // Override with a test implementation that returns our test date
    // No need for capture as we're using a static variable
    NapiWrapper::GetDateValueImpl = [](napi_env env, napi_value value, double* result) -> napi_status {
        *result = g_testDate;
        return napi_ok;
    };
    
    // Rest of your test remains the same...
    DatumStorage storage(DatumStorage::SqlType::Date);
    bool success = JSTimeAdapter::bindJsDateToDateStorage(
        reinterpret_cast<napi_env>(1), // Dummy env
        reinterpret_cast<napi_value>(1), // Dummy value
        storage);
    
    EXPECT_TRUE(success);
    
    // Verify the storage
    EXPECT_EQ(storage.getType(), DatumStorage::SqlType::Date);
    EXPECT_EQ(storage.size(), 1);
    
    // Get the date value
    SQL_DATE_STRUCT date = storage.getValue<SQL_DATE_STRUCT>(0);
    EXPECT_EQ(date.year, 2023);
    EXPECT_EQ(date.month, 1);
    EXPECT_EQ(date.day, 15);
    
    // Restore the original implementation
    NapiWrapper::GetDateValueImpl = original;
}

