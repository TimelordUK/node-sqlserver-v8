// test/cpp/data_storage_test.cpp
#include <gtest/gtest.h>
#include "datum_storage.h"  // Adjust path as needed

using namespace mssql;

TEST(DataStorageTest, IntegerInitialization) {
    DatumStorage storage(DatumStorage::SqlType::Integer);
    EXPECT_EQ(storage.getType(), DatumStorage::SqlType::Integer);
    EXPECT_EQ(storage.size(), 0);
    EXPECT_TRUE(storage.empty());
}

TEST(DataStorageTest, TinyIntInitialization) {
    DatumStorage storage(DatumStorage::SqlType::TinyInt);
    EXPECT_EQ(storage.getType(), DatumStorage::SqlType::TinyInt);
    EXPECT_EQ(storage.size(), 0);
    EXPECT_TRUE(storage.empty());
}

TEST(DataStorageTest, BigInttInitialization) {
    DatumStorage storage(DatumStorage::SqlType::BigInt);
    EXPECT_EQ(storage.getType(), DatumStorage::SqlType::BigInt);
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

// Test integer operations
TEST(DataStorageTest, IntegerOperations) {
    DatumStorage storage(DatumStorage::SqlType::Integer);

    // Test adding values
    storage.addValue<int32_t>(42);
    storage.addValue<int32_t>(100);
    storage.addValue<int32_t>(-5);

    EXPECT_EQ(storage.size(), 3);
    EXPECT_FALSE(storage.empty());
    EXPECT_EQ(storage.getValue<int32_t>(0), 42);
    EXPECT_EQ(storage.getValue<int32_t>(1), 100);
    EXPECT_EQ(storage.getValue<int32_t>(2), -5);

    // Test resize
    storage.resize(5);
    EXPECT_EQ(storage.size(), 5);

    // Test clear
    storage.clear();
    EXPECT_EQ(storage.size(), 0);
    EXPECT_TRUE(storage.empty());
}

// Test TinyInt operations
TEST(DataStorageTest, TinyIntOperations) {
    DatumStorage storage(DatumStorage::SqlType::TinyInt);

    // Test adding values
    storage.addValue<int8_t>(42);
    storage.addValue<int8_t>(100);
    storage.addValue<int8_t>(-5);

    EXPECT_EQ(storage.size(), 3);
    EXPECT_FALSE(storage.empty());
    EXPECT_EQ(storage.getValue<int8_t>(0), 42);
    EXPECT_EQ(storage.getValue<int8_t>(1), 100);
    EXPECT_EQ(storage.getValue<int8_t>(2), -5);
}

// Test BigInt operations
TEST(DataStorageTest, BigIntOperations) {
    DatumStorage storage(DatumStorage::SqlType::BigInt);

    // Test adding values
    storage.addValue<int64_t>(1234567890123LL);
    storage.addValue<int64_t>(-9876543210987LL);

    EXPECT_EQ(storage.size(), 2);
    EXPECT_FALSE(storage.empty());
    EXPECT_EQ(storage.getValue<int64_t>(0), 1234567890123LL);
    EXPECT_EQ(storage.getValue<int64_t>(1), -9876543210987LL);
}

// Test double operations
TEST(DataStorageTest, DoubleOperations) {
    DatumStorage storage(DatumStorage::SqlType::Double);

    // Test adding values
    storage.addValue<double>(3.14159);
    storage.addValue<double>(-2.71828);

    EXPECT_EQ(storage.size(), 2);
    EXPECT_FALSE(storage.empty());
    EXPECT_DOUBLE_EQ(storage.getValue<double>(0), 3.14159);
    EXPECT_DOUBLE_EQ(storage.getValue<double>(1), -2.71828);
}

// Test date operations
TEST(DataStorageTest, DateOperations) {
    DatumStorage storage(DatumStorage::SqlType::Date);

    // Create a date
    SQL_DATE_STRUCT date1 = { 2023, 5, 15 };
    SQL_DATE_STRUCT date2 = { 1999, 12, 31 };

    // Test adding values
    storage.addValue<SQL_DATE_STRUCT>(date1);
    storage.addValue<SQL_DATE_STRUCT>(date2);

    EXPECT_EQ(storage.size(), 2);
    EXPECT_FALSE(storage.empty());

    SQL_DATE_STRUCT result1 = storage.getValue<SQL_DATE_STRUCT>(0);
    SQL_DATE_STRUCT result2 = storage.getValue<SQL_DATE_STRUCT>(1);

    EXPECT_EQ(result1.year, 2023);
    EXPECT_EQ(result1.month, 5);
    EXPECT_EQ(result1.day, 15);

    EXPECT_EQ(result2.year, 1999);
    EXPECT_EQ(result2.month, 12);
    EXPECT_EQ(result2.day, 31);
}

// Test string operations (VarChar)
TEST(DataStorageTest, VarCharOperations) {
    DatumStorage storage(DatumStorage::SqlType::VarChar);

    // Create a vector and add some characters
    auto vec = storage.getTypedVector<char>();
    const char* testString = "Hello, World!";
    for (size_t i = 0; i < strlen(testString); ++i) {
        vec->push_back(testString[i]);
    }

    EXPECT_EQ(storage.size(), strlen(testString));
    EXPECT_FALSE(storage.empty());

    // Verify characters
    for (size_t i = 0; i < strlen(testString); ++i) {
        EXPECT_EQ(storage.getValue<char>(i), testString[i]);
    }
}

// Test Unicode string operations (NVarChar)
TEST(DataStorageTest, NVarCharOperations) {
    DatumStorage storage(DatumStorage::SqlType::NVarChar);

    // Create a vector and add some wide characters
    auto vec = storage.getTypedVector<uint16_t>();
    const wchar_t* testString = L"Hello, 世界!";
    size_t length = wcslen(testString);

    for (size_t i = 0; i < length; ++i) {
        vec->push_back(static_cast<uint16_t>(testString[i]));
    }

    EXPECT_EQ(storage.size(), length);
    EXPECT_FALSE(storage.empty());

    // Verify characters
    for (size_t i = 0; i < length; ++i) {
        EXPECT_EQ(storage.getValue<uint16_t>(i), static_cast<uint16_t>(testString[i]));
    }
}

// Test type mismatch error
TEST(DataStorageTest, TypeMismatchError) {
    DatumStorage storage(DatumStorage::SqlType::Integer);

    // Add a valid value
    storage.addValue<int32_t>(42);

    // Try to add an incompatible type
    EXPECT_THROW(storage.addValue<double>(3.14), std::runtime_error);

    // Try to get an incompatible type
    EXPECT_THROW(storage.getValue<double>(0), std::runtime_error);
}

// Test out of bounds error
TEST(DataStorageTest, OutOfBoundsError) {
    DatumStorage storage(DatumStorage::SqlType::Integer);

    storage.addValue<int32_t>(42);

    // Try to access an index that doesn't exist
    EXPECT_THROW(storage.getValue<int32_t>(1), std::out_of_range);
}

// Test type change
TEST(DataStorageTest, TypeChange) {
    DatumStorage storage(DatumStorage::SqlType::Integer);

    // Add an integer
    storage.addValue<int32_t>(42);
    EXPECT_EQ(storage.size(), 1);

    // Change type
    storage.setType(DatumStorage::SqlType::Double);

    // Verify that the vector was cleared
    EXPECT_EQ(storage.size(), 0);

    // Add a double
    storage.addValue<double>(3.14159);
    EXPECT_EQ(storage.size(), 1);
    EXPECT_DOUBLE_EQ(storage.getValue<double>(0), 3.14159);
}

// Test capacity and reserve
TEST(DataStorageTest, ReserveCapacity) {
    DatumStorage storage(DatumStorage::SqlType::Integer);

    // Reserve space
    storage.reserve(100);
    EXPECT_GE(storage.capacity(), 100);
    EXPECT_EQ(storage.size(), 0);

    // Add some values
    for (int i = 0; i < 10; ++i) {
        storage.addValue<int32_t>(i);
    }

    EXPECT_EQ(storage.size(), 10);
    EXPECT_GE(storage.capacity(), 100);
}

// Test debug output
TEST(DataStorageTest, DebugOutput) {
    DatumStorage storage(DatumStorage::SqlType::Integer);
    storage.addValue<int32_t>(42);
    storage.addValue<int32_t>(100);

    // Get debug string
    std::string debugStr = storage.getDebugString();

    // Just check that it contains some expected substrings
    EXPECT_NE(debugStr.find("SQL Type: Integer"), std::string::npos);
    EXPECT_NE(debugStr.find("Size: 2"), std::string::npos);
    EXPECT_NE(debugStr.find("42"), std::string::npos);
    EXPECT_NE(debugStr.find("100"), std::string::npos);

    // Check compact format
    std::string compactStr = storage.getDebugString(true, 5, true);
    EXPECT_NE(compactStr.find("DatumStorage[Type=Integer"), std::string::npos);
}