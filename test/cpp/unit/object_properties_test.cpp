#include <iostream>
#include <cassert>
#include <cstring>
#include <node_api.h>
#include <gtest/gtest.h>
#include "time_utils.h"

using namespace mssql;

// Test function to exercise the mock API
TEST(MockNapiTest, ObjectProperties) {
    std::cout << "Testing object property operations..." << std::endl;

    napi_env env = nullptr;
    napi_value obj, key, value, result;
    bool has_prop;
    char buffer[256];
    size_t copied;

    // Create an object
    assert(napi_create_object(env, &obj) == napi_ok);

    // Create string key and value
    assert(napi_create_string_utf8(env, "testKey", NAPI_AUTO_LENGTH, &key) == napi_ok);
    assert(napi_create_string_utf8(env, "testValue", NAPI_AUTO_LENGTH, &value) == napi_ok);

    // Set property
    assert(napi_set_property(env, obj, key, value) == napi_ok);

    // Check if property exists
    assert(napi_has_property(env, obj, key, &has_prop) == napi_ok);
    assert(has_prop == true);

    // Get property
    assert(napi_get_property(env, obj, key, &result) == napi_ok);

    // Verify value
    assert(napi_get_value_string_utf8(env, result, buffer, sizeof(buffer), &copied) == napi_ok);
    assert(strcmp(buffer, "testValue") == 0);

    // Test named property methods directly
    assert(napi_create_string_utf8(env, "namedValue", NAPI_AUTO_LENGTH, &value) == napi_ok);
    assert(napi_set_named_property(env, obj, "namedKey", value) == napi_ok);

    assert(napi_has_named_property(env, obj, "namedKey", &has_prop) == napi_ok);
    assert(has_prop == true);

    assert(napi_get_named_property(env, obj, "namedKey", &result) == napi_ok);
    assert(napi_get_value_string_utf8(env, result, buffer, sizeof(buffer), &copied) == napi_ok);
    assert(strcmp(buffer, "namedValue") == 0);

    std::cout << "Object property tests passed!" << std::endl;
}

 TEST(MockNapiTest, ArrayProperties) {
    std::cout << "Testing array operations..." << std::endl;

    napi_env env = nullptr;
    napi_value arr, value, result;
    bool has_elem;
    uint32_t length;
    double num_val;

    // Create an array with initial length
    assert(napi_create_array_with_length(env, 5, &arr) == napi_ok);

    // Check length
    assert(napi_get_array_length(env, arr, &length) == napi_ok);
    assert(length == 5);

    // Set an element
    assert(napi_create_double(env, 42.0, &value) == napi_ok);
    assert(napi_set_element(env, arr, 2, value) == napi_ok);

    // Check if element exists
    assert(napi_has_element(env, arr, 2, &has_elem) == napi_ok);
    assert(has_elem == true);

    // Get element
    assert(napi_get_element(env, arr, 2, &result) == napi_ok);

    // Verify value
    assert(napi_get_value_double(env, result, &num_val) == napi_ok);
    assert(num_val == 42.0);

    std::cout << "Array operation tests passed!" << std::endl;
}
