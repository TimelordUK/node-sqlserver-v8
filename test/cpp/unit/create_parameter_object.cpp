#include <gtest/gtest.h>
#include <node_api.h>
#include <string>
#include <vector>
#include <iostream>
#include <memory>

// This will use our enhanced N-API mock implementation

// Helper functions to create complex JS objects
napi_value createParameterObject(napi_env env) {
    napi_value obj;
    napi_value prop_value;
    napi_value bytes_obj;
    napi_value data_array;
    napi_value array_element;
    napi_value bool_value;
    
    // Create the main object
    napi_create_object(env, &obj);
    
    // Add string properties
    napi_create_string_utf8(env, "STRING", NAPI_AUTO_LENGTH, &prop_value);
    napi_set_named_property(env, obj, "type", prop_value);
    
    napi_create_string_utf8(env, "SQL_WVARCHAR", NAPI_AUTO_LENGTH, &prop_value);
    napi_set_named_property(env, obj, "sqlType", prop_value);
    
    napi_create_string_utf8(env, "JS_STRING", NAPI_AUTO_LENGTH, &prop_value);
    napi_set_named_property(env, obj, "jsType", prop_value);
    
    napi_create_string_utf8(env, "SQL_C_WCHAR", NAPI_AUTO_LENGTH, &prop_value);
    napi_set_named_property(env, obj, "cType", prop_value);
    
    // Add numeric properties
    napi_create_double(env, 13, &prop_value);
    napi_set_named_property(env, obj, "precision", prop_value);
    
    napi_create_double(env, 0, &prop_value);
    napi_set_named_property(env, obj, "scale", prop_value);
    
    napi_create_string_utf8(env, "Normal string", NAPI_AUTO_LENGTH, &prop_value);
    napi_set_named_property(env, obj, "value", prop_value);
    
    napi_create_double(env, 13, &prop_value);
    napi_set_named_property(env, obj, "paramSize", prop_value);
    
    napi_create_double(env, 28, &prop_value);
    napi_set_named_property(env, obj, "bufferLen", prop_value);
    
    napi_create_string_utf8(env, "ucs2", NAPI_AUTO_LENGTH, &prop_value);
    napi_set_named_property(env, obj, "encoding", prop_value);
    
    // Create the bytes object with buffer
    napi_create_object(env, &bytes_obj);
    
    napi_create_string_utf8(env, "Buffer", NAPI_AUTO_LENGTH, &prop_value);
    napi_set_named_property(env, bytes_obj, "type", prop_value);
    
    // Create the data array with 26 elements
    uint8_t buffer_data[] = {
        78, 0, 111, 0, 114, 0, 109, 0, 97, 0, 108, 0, 32, 0, 
        115, 0, 116, 0, 114, 0, 105, 0, 110, 0, 103, 0
    };
    
    napi_create_array_with_length(env, 26, &data_array);
    
    // Fill the array with the buffer data
    for (uint32_t i = 0; i < 26; i++) {
        napi_create_double(env, buffer_data[i], &array_element);
        napi_set_element(env, data_array, i, array_element);
    }
    
    // Set the data array property
    napi_set_named_property(env, bytes_obj, "data", data_array);
    
    // Add the bytes object to the main object
    napi_set_named_property(env, obj, "bytes", bytes_obj);
    
    // Add boolean properties
    napi_get_boolean(env, false, &bool_value);
    napi_set_named_property(env, obj, "is_output", bool_value);
    
    return obj;
}

// Function to test extracting data from the parameter object
// This simulates what your JsObjectMapper would do
void extractParameterData(napi_env env, napi_value obj) {
    napi_value prop_value;
    napi_valuetype value_type;
    char string_value[256];
    size_t string_length;
    double number_value;
    napi_value bytes_obj;
    napi_value data_array;
    uint32_t array_length;
    napi_value array_element;
    
    // Extract string properties
    napi_get_named_property(env, obj, "type", &prop_value);
    napi_typeof(env, prop_value, &value_type);
    
    ASSERT_EQ(value_type, napi_string);
    napi_get_value_string_utf8(env, prop_value, string_value, sizeof(string_value), &string_length);
    ASSERT_STREQ(string_value, "STRING");
    
    // Extract numeric property
    napi_get_named_property(env, obj, "precision", &prop_value);
    napi_typeof(env, prop_value, &value_type);
    
    ASSERT_EQ(value_type, napi_number);
    napi_get_value_double(env, prop_value, &number_value);
    ASSERT_EQ(number_value, 13);
    
    // Extract the bytes object
    napi_get_named_property(env, obj, "bytes", &bytes_obj);
    napi_typeof(env, bytes_obj, &value_type);
    
    ASSERT_EQ(value_type, napi_object);
    
    // Extract the data array
    napi_get_named_property(env, bytes_obj, "data", &data_array);
    bool is_array = false;
    napi_is_array(env, data_array, &is_array);
    
    ASSERT_TRUE(is_array);
    
    // Get array length
    napi_get_array_length(env, data_array, &array_length);
    ASSERT_EQ(array_length, 26);
    
    // Extract a few elements to verify
    napi_get_element(env, data_array, 0, &array_element);
    napi_get_value_double(env, array_element, &number_value);
    ASSERT_EQ(number_value, 78); // ASCII 'N'
    
    napi_get_element(env, data_array, 2, &array_element);
    napi_get_value_double(env, array_element, &number_value);
    ASSERT_EQ(number_value, 111); // ASCII 'o'
}

// Test for JSObjectMapper using our mock
TEST(JsObjectMapperTest, ConvertComplexParameter) {
    // Create the mock parameter object
    napi_env env = nullptr; // Our mock doesn't use this
    napi_value param_obj = createParameterObject(env);
    
    // Test extraction of properties
    extractParameterData(env, param_obj);
}

// Test that simulates converting from JavaScript to native parameter
TEST(JsObjectMapperTest, ConvertToNativeParameter) {
    napi_env env = nullptr;
    napi_value param_obj = createParameterObject(env);
    
    // Extract key properties that would be used for conversion
    napi_value prop_value;
    char string_value[256];
    size_t string_length;
    double number_value;
    bool bool_value;
    
    // Get string type
    napi_get_named_property(env, param_obj, "type", &prop_value);
    napi_get_value_string_utf8(env, prop_value, string_value, sizeof(string_value), &string_length);
    std::string type(string_value);
    ASSERT_EQ(type, "STRING");
    
    // Get precision
    napi_get_named_property(env, param_obj, "precision", &prop_value);
    napi_get_value_double(env, prop_value, &number_value);
    int precision = static_cast<int>(number_value);
    ASSERT_EQ(precision, 13);
    
    // Get encoding
    napi_get_named_property(env, param_obj, "encoding", &prop_value);
    napi_get_value_string_utf8(env, prop_value, string_value, sizeof(string_value), &string_length);
    std::string encoding(string_value);
    ASSERT_EQ(encoding, "ucs2");
    
    // Get the actual string value
    napi_get_named_property(env, param_obj, "value", &prop_value);
    napi_get_value_string_utf8(env, prop_value, string_value, sizeof(string_value), &string_length);
    std::string value(string_value);
    ASSERT_EQ(value, "Normal string");
    
    // Here you would convert the parameter to your ODBC native format
    std::cout << "Extracted parameter: " << type 
              << ", Value: " << value 
              << ", Precision: " << precision 
              << ", Encoding: " << encoding << std::endl;
}

// This test demonstrates how to extract binary data from the Buffer
TEST(JsObjectMapperTest, ExtractBufferData) {
    napi_env env = nullptr;
    napi_value param_obj = createParameterObject(env);
    
    // Extract the bytes object
    napi_value bytes_obj;
    napi_get_named_property(env, param_obj, "bytes", &bytes_obj);
    
    // Extract the data array
    napi_value data_array;
    napi_get_named_property(env, bytes_obj, "data", &data_array);
    
    // Get the array length
    uint32_t array_length;
    napi_get_array_length(env, data_array, &array_length);
    
    // Create a vector to hold the binary data
    std::vector<uint8_t> buffer_data(array_length);
    
    // Extract all elements
    for (uint32_t i = 0; i < array_length; i++) {
        napi_value element;
        double value;
        napi_get_element(env, data_array, i, &element);
        napi_get_value_double(env, element, &value);
        buffer_data[i] = static_cast<uint8_t>(value);
    }
    
    // Verify some of the data
    ASSERT_EQ(buffer_data[0], 78);  // 'N'
    ASSERT_EQ(buffer_data[2], 111); // 'o'
    ASSERT_EQ(buffer_data[4], 114); // 'r'
    
    // Convert the UCS2 data to a string (simplified version)
    std::string ucs2_str;
    for (size_t i = 0; i < buffer_data.size(); i += 2) {
        if (i + 1 < buffer_data.size() && buffer_data[i+1] == 0) {
            // This is a simple ASCII character (since high byte is 0)
            ucs2_str += static_cast<char>(buffer_data[i]);
        }
    }
    
    ASSERT_EQ(ucs2_str, "Normal string");
}

// Additional test to simulate integrating with JsObjectMapper
TEST(JsObjectMapperTest, NativeParamConversion) {
    napi_env env = nullptr;
    napi_value param_obj = createParameterObject(env);
    
    // This would simulate how the JsObjectMapper's toNativeParam would work
    // We're extracting the properties we need for a NativeParam
    
    napi_value prop_value;
    char string_value[256];
    size_t string_length;
    double number_value;
    
    // In a real implementation, you would populate your NativeParam struct
    // For this test, we'll just verify some key properties
    
    // Check the SQL type
    napi_get_named_property(env, param_obj, "sqlType", &prop_value);
    napi_get_value_string_utf8(env, prop_value, string_value, sizeof(string_value), &string_length);
    ASSERT_STREQ(string_value, "SQL_WVARCHAR");
    
    // Check the precision
    napi_get_named_property(env, param_obj, "precision", &prop_value);
    napi_get_value_double(env, prop_value, &number_value);
    ASSERT_EQ(number_value, 13);
    
    // Check the value
    napi_get_named_property(env, param_obj, "value", &prop_value);
    napi_get_value_string_utf8(env, prop_value, string_value, sizeof(string_value), &string_length);
    ASSERT_STREQ(string_value, "Normal string");
}