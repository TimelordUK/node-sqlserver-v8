#include <gtest/gtest.h>
#include <node_api.h>
#include <string>
#include <vector>
#include <memory>
#include <variant>

// Define the native structures similar to what you have in your ODBC driver
using SqlParamValue = std::variant<
    std::nullptr_t,
    bool,
    int32_t,
    int64_t,
    double,
    std::string,
    std::vector<uint8_t>
>;

// Native parameter structure
struct NativeParam {
    bool is_user_defined = false;
    int32_t type_id = 0;
    std::string schema;
    bool bcp = false;
    int32_t bcp_version = 0;
    std::string table_name;
    int32_t ordinal_position = 0;
    int32_t scale = 0;
    int32_t offset = 0;
    int32_t precision = 0;
    bool is_output = false;
    std::string name;
    SqlParamValue value = nullptr;
};

// Mock implementation of JsObjectMapper
class MockJsObjectMapper {
public:
    // Helper methods for extracting values from JS objects
    static std::string safeGetString(napi_env env, napi_value obj, const std::string& prop, const std::string& defaultVal = "") {
        napi_value prop_value;
        napi_valuetype value_type;
        bool has_prop;
        char string_value[1024] = {0};
        size_t string_length = 0;
        
        // Check if property exists
        napi_has_named_property(env, obj, prop.c_str(), &has_prop);
        if (!has_prop) {
            return defaultVal;
        }
        
        // Get the property
        napi_get_named_property(env, obj, prop.c_str(), &prop_value);
        
        // Check the type
        napi_typeof(env, prop_value, &value_type);
        if (value_type != napi_string) {
            return defaultVal;
        }
        
        // Get the string value
        napi_get_value_string_utf8(env, prop_value, string_value, sizeof(string_value), &string_length);
        return std::string(string_value, string_length);
    }
    
    static int64_t safeGetInt64(napi_env env, napi_value obj, const std::string& prop, int64_t defaultVal = 0) {
        napi_value prop_value;
        napi_valuetype value_type;
        bool has_prop;
        double number_value = 0;
        
        // Check if property exists
        napi_has_named_property(env, obj, prop.c_str(), &has_prop);
        if (!has_prop) {
            return defaultVal;
        }
        
        // Get the property
        napi_get_named_property(env, obj, prop.c_str(), &prop_value);
        
        // Check the type
        napi_typeof(env, prop_value, &value_type);
        if (value_type != napi_number) {
            return defaultVal;
        }
        
        // Get the numeric value
        napi_get_value_double(env, prop_value, &number_value);
        return static_cast<int64_t>(number_value);
    }
    
    static int32_t safeGetInt32(napi_env env, napi_value obj, const std::string& prop, int32_t defaultVal = 0) {
        return static_cast<int32_t>(safeGetInt64(env, obj, prop, defaultVal));
    }
    
    static bool safeGetBool(napi_env env, napi_value obj, const std::string& prop, bool defaultVal = false) {
        napi_value prop_value;
        napi_valuetype value_type;
        bool has_prop;
        bool bool_value = false;
        
        // Check if property exists
        napi_has_named_property(env, obj, prop.c_str(), &has_prop);
        if (!has_prop) {
            return defaultVal;
        }
        
        // Get the property
        napi_get_named_property(env, obj, prop.c_str(), &prop_value);
        
        // Check the type
        napi_typeof(env, prop_value, &value_type);
        if (value_type != napi_boolean) {
            return defaultVal;
        }
        
        // Get the boolean value
        napi_get_value_bool(env, prop_value, &bool_value);
        return bool_value;
    }
    
    static SqlParamValue safeGetValue(napi_env env, napi_value obj, const std::string& prop) {
        napi_value prop_value;
        napi_valuetype value_type;
        bool has_prop;
        
        // Check if property exists
        napi_has_named_property(env, obj, prop.c_str(), &has_prop);
        if (!has_prop) {
            return nullptr;
        }
        
        // Get the property
        napi_get_named_property(env, obj, prop.c_str(), &prop_value);
        
        // Check the type
        napi_typeof(env, prop_value, &value_type);
        
        // Handle null or undefined
        if (value_type == napi_undefined || value_type == napi_null) {
            return nullptr;
        }
        
        if (value_type == napi_boolean) {
            bool value;
            napi_get_value_bool(env, prop_value, &value);
            return value;
        } 
        else if (value_type == napi_number) {
            double double_value;
            napi_get_value_double(env, prop_value, &double_value);
            
            // Try to deduce if it's an integer or a float
            int64_t int_value = static_cast<int64_t>(double_value);
            
            if (double_value == static_cast<double>(int_value)) {
                // It's an integer
                if (int_value >= INT32_MIN && int_value <= INT32_MAX) {
                    return static_cast<int32_t>(int_value);
                }
                return int_value;
            }
            return double_value;
        } 
        else if (value_type == napi_string) {
            char string_value[1024] = {0};
            size_t string_length = 0;
            napi_get_value_string_utf8(env, prop_value, string_value, sizeof(string_value), &string_length);
            return std::string(string_value, string_length);
        }
        else {
            bool is_buffer = false;
            napi_is_buffer(env, prop_value, &is_buffer);
            
            if (is_buffer) {
                void* data;
                size_t length;
                napi_get_buffer_info(env, prop_value, &data, &length);
                
                // Copy buffer data to a vector
                uint8_t* byte_data = static_cast<uint8_t*>(data);
                return std::vector<uint8_t>(byte_data, byte_data + length);
            }
        }
        
        // Default to null for unsupported types
        return nullptr;
    }
    
    // Convert a JS object to a NativeParam
    static NativeParam toNativeParam(napi_env env, napi_value jsObject) {
        NativeParam result;
        
        result.is_user_defined = safeGetBool(env, jsObject, "is_user_defined");
        result.type_id = safeGetInt32(env, jsObject, "type_id");
        result.schema = safeGetString(env, jsObject, "schema");
        result.bcp = safeGetBool(env, jsObject, "bcp");
        result.bcp_version = safeGetInt32(env, jsObject, "bcp_version");
        result.table_name = safeGetString(env, jsObject, "table_name");
        result.ordinal_position = safeGetInt32(env, jsObject, "ordinal_position");
        result.scale = safeGetInt32(env, jsObject, "scale");
        result.offset = safeGetInt32(env, jsObject, "offset");
        result.precision = safeGetInt32(env, jsObject, "precision");
        result.is_output = safeGetBool(env, jsObject, "is_output");
        result.name = safeGetString(env, jsObject, "name");
        result.value = safeGetValue(env, jsObject, "value");
        
        return result;
    }
};

// Helper to create your specific parameter object
napi_value createOdbcParameterObject(napi_env env) {
    napi_value obj;
    napi_value prop_value;
    napi_value bytes_obj;
    napi_value data_array;
    napi_value array_element;
    
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
    
    // Add some properties that are used in NativeParam
    napi_create_double(env, 1, &prop_value);
    napi_set_named_property(env, obj, "type_id", prop_value);
    
    napi_create_string_utf8(env, "dbo", NAPI_AUTO_LENGTH, &prop_value);
    napi_set_named_property(env, obj, "schema", prop_value);
    
    napi_value bool_value;
    napi_get_boolean(env, false, &bool_value);
    napi_set_named_property(env, obj, "is_output", bool_value);
    
    napi_create_string_utf8(env, "testParam", NAPI_AUTO_LENGTH, &prop_value);
    napi_set_named_property(env, obj, "name", prop_value);
    
    return obj;
}

// Test for JSObjectMapper mock
TEST(JsObjectMapperMockTest, ConvertToNativeParam) {
    napi_env env = nullptr; // Our mock doesn't use this
    napi_value param_obj = createOdbcParameterObject(env);
    
    // Convert to native parameter
    NativeParam param = MockJsObjectMapper::toNativeParam(env, param_obj);
    
    // Verify conversion
    ASSERT_EQ(param.type_id, 1);
    ASSERT_EQ(param.schema, "dbo");
    ASSERT_EQ(param.is_output, false);
    ASSERT_EQ(param.name, "testParam");
    
    // Check the value
    ASSERT_TRUE(std::holds_alternative<std::string>(param.value));
    ASSERT_EQ(std::get<std::string>(param.value), "Normal string");
}

TEST(JsObjectMapperMockTest, ExtractBufferData) {
    napi_env env = nullptr;
    napi_value param_obj = createOdbcParameterObject(env);
    
    // Get the bytes buffer
    napi_value bytes_obj;
    napi_get_named_property(env, param_obj, "bytes", &bytes_obj);
    
    // Extract as a value
    SqlParamValue buffer_value = MockJsObjectMapper::safeGetValue(env, bytes_obj, "data");
    
    // We expect this to be an array which we'd convert to a vector
    // For this test, we'll manually extract the array
    napi_value data_array;
    napi_get_named_property(env, bytes_obj, "data", &data_array);
    
    // Get array length
    uint32_t length;
    napi_get_array_length(env, data_array, &length);
    
    // Create a buffer to hold the data
    std::vector<uint8_t> buffer(length);
    
    // Extract each element
    for (uint32_t i = 0; i < length; i++) {
        napi_value element;
        double value;
        napi_get_element(env, data_array, i, &element);
        napi_get_value_double(env, element, &value);
        buffer[i] = static_cast<uint8_t>(value);
    }
    
    // Verify the buffer contents
    ASSERT_EQ(buffer[0], 78);  // 'N'
    ASSERT_EQ(buffer[1], 0);   // UCS2 second byte
    ASSERT_EQ(buffer[2], 111); // 'o'
    
    // Simulate conversion to string
    std::string result;
    for (size_t i = 0; i < buffer.size(); i += 2) {
        if (buffer[i+1] == 0) { // Simple ASCII char (high byte is 0)
            result += static_cast<char>(buffer[i]);
        }
    }
    
    ASSERT_EQ(result, "Normal string");
}

// Test simulating access to specific properties
TEST(JsObjectMapperMockTest, AccessPropertiesDirectly) {
    napi_env env = nullptr;
    napi_value param_obj = createOdbcParameterObject(env);
    
    // Extract specific properties that are used in ODBC binding
    std::string sqlType = MockJsObjectMapper::safeGetString(env, param_obj, "sqlType");
    std::string cType = MockJsObjectMapper::safeGetString(env, param_obj, "cType");
    int32_t precision = MockJsObjectMapper::safeGetInt32(env, param_obj, "precision");
    int32_t bufferLen = MockJsObjectMapper::safeGetInt32(env, param_obj, "bufferLen");
    std::string encoding = MockJsObjectMapper::safeGetString(env, param_obj, "encoding");
    
    // Verify extracted values
    ASSERT_EQ(sqlType, "SQL_WVARCHAR");
    ASSERT_EQ(cType, "SQL_C_WCHAR");
    ASSERT_EQ(precision, 13);
    ASSERT_EQ(bufferLen, 28);
    ASSERT_EQ(encoding, "ucs2");
    
    // This would be used to set up ODBC binding parameters
    std::cout << "ODBC Binding Parameters:" << std::endl;
    std::cout << "  SQL Type: " << sqlType << std::endl;
    std::cout << "  C Type: " << cType << std::endl;
    std::cout << "  Precision: " << precision << std::endl;
    std::cout << "  Buffer Length: " << bufferLen << std::endl;
    std::cout << "  Encoding: " << encoding << std::endl;
}