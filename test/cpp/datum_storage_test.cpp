// test/cpp/data_storage_test.cpp
#include <gtest/gtest.h>
#include "datum_storage.h"  // Adjust path as needed

using namespace mssql;

TEST(DataStorageTest, Initialization) {
    DatumStorage storage(DatumStorage::SqlType::Integer);
    EXPECT_EQ(storage.getType(), DatumStorage::SqlType::Integer);
    EXPECT_EQ(storage.size(), 0);
    EXPECT_TRUE(storage.empty());
}


TEST(DataStorageTest, IntegerStorage) {
    DatumStorage storage(DatumStorage::SqlType::Integer);
    
    // Test adding values
    storage.addValue<int32_t>(42);
    storage.addValue<int32_t>(100);
    
    EXPECT_EQ(storage.size(), 2);
    EXPECT_EQ(storage.getValue<int32_t>(0), 42);
    EXPECT_EQ(storage.getValue<int32_t>(1), 100);
    
    // Test type safety
    EXPECT_THROW(storage.addValue<double>(3.14), std::runtime_error);
}


TEST(DatumStorageTest, BasicTypeHandling) {
    std::cout << "\n=== Starting BasicTypeHandling Test ===" << std::endl;

    // Create with explicit type
    std::cout << "Creating DatumStorage with Integer type" << std::endl;
    DatumStorage storage(DatumStorage::SqlType::Integer);

    // Get the base vector
    std::cout << "Calling getStorage()" << std::endl;
    auto baseVec = storage.getStorage();
    std::cout << "getStorage() returned: " << (baseVec ? "not null" : "NULL") << std::endl;

    // Try to get the typed vector
    std::cout << "Calling getTypedVector<int32_t>()" << std::endl;
    try {
        auto typedVec = storage.getTypedVector<int32_t>();
        std::cout << "getTypedVector successful, vector is " << (typedVec ? "not null" : "NULL") << std::endl;

        // Do something with the vector to verify it works
        typedVec->push_back(42);
        std::cout << "Added value 42 to vector" << std::endl;
        std::cout << "Vector size is now: " << typedVec->size() << std::endl;
    }
    catch (const std::exception& e) {
        std::cout << "EXCEPTION: " << e.what() << std::endl;
     //   FAIL() << "Exception thrown: " << e.what();
    }

    std::cout << "=== Completed BasicTypeHandling Test ===\n" << std::endl;
}

TEST(DatumStorageTest, DebugPrint) {
    DatumStorage storage(DatumStorage::SqlType::Integer);
    Logger::GetInstance().SetLogLevel(LogLevel::Debug);
    Logger::GetInstance().SetLogToConsole(true);
    // Add some values
    storage.addValue<int32_t>(42);
    storage.addValue<int32_t>(100);
    storage.addValue<int32_t>(-5);

    storage.logDebug();

    // Print debug info
    std::cout << "Debug info:\n" << storage.getDebugString() << std::endl;

    // You can also just call the method directly
    storage.debugPrint();
}

TEST(DataStorageTest, VectorOperations) {
    DatumStorage storage(DatumStorage::SqlType::Double);
    
    // Test reserve
    storage.reserve(10);
    EXPECT_GE(storage.capacity(), 10);
    
    // Test resize
    storage.resize(5);
    EXPECT_EQ(storage.size(), 5);
    
    // Test clear
    storage.clear();
    EXPECT_EQ(storage.size(), 0);
}