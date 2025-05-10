#ifdef MOCK_NAPI

#include <node_api.h>
#include <cstring>
#include <cstdlib>
#include <cstdint>
#include <unordered_map>
#include <string>
#include <vector>
#include <variant>
#include <memory>
#include <functional>
#include <iostream>
#include <stdexcept>

// Add this at the top of the file after the includes:
#ifdef _WIN32
#ifdef BUILDING_MOCK_NAPI
#define NAPI_MOCK_EXTERN __declspec(dllexport)
#else
#define NAPI_MOCK_EXTERN __declspec(dllimport)
#endif
#else
#define NAPI_MOCK_EXTERN __attribute__((visibility("default")))
#endif

// Forward declarations
struct JSValue;
using JSValuePtr = std::shared_ptr<JSValue>;

// Reference management structure definition
struct napi_ref__
{
  napi_value value;
  uint32_t refcount;

  napi_ref__(napi_value v) : value(v), refcount(1) {}
};

// Mock environment for tracking JavaScript values
struct MockEnvironment
{
  // Track all created values to avoid memory leaks
  std::vector<JSValuePtr> values;

  // Keep track of any pending exceptions
  JSValuePtr pendingException = nullptr;

  // Get last error info
  napi_extended_error_info lastError = {0};

  // Utility for creating tracked values
  template <typename... Args>
  JSValuePtr createValue(Args &&...args)
  {
    auto value = std::make_shared<JSValue>(std::forward<Args>(args)...);
    values.push_back(value);
    return value;
  }
};

// Global environment instance
static MockEnvironment g_env;

// JavaScript value types
enum class JSType
{
  UNDEFINED,
  NULL_TYPE,
  BOOLEAN,
  NUMBER,
  STRING,
  OBJECT,
  FUNCTION,
  ARRAY,
  BUFFER,
  EXTERNAL,
  PROMISE,
  TYPEDARRAY
};

// Property descriptor for object properties
struct Property
{
  std::string name;
  JSValuePtr value;
  bool writable = true;
  bool enumerable = true;
  bool configurable = true;
};

// Native callback type
using NativeCallback = std::function<napi_value(napi_env, napi_callback_info)>;

// JavaScript value representation
struct JSValue
{
  JSType type = JSType::UNDEFINED;

  // Value storage using variant
  std::variant<
      bool,                                        // boolean
      double,                                      // number
      std::string,                                 // string
      std::unordered_map<std::string, JSValuePtr>, // object properties
      std::vector<JSValuePtr>,                     // array elements
      std::vector<uint8_t>,                        // buffer data
      void *,                                      // external/wrapped data
      NativeCallback                               // function
      >
      data;

  // Associated native object (for wrapping)
  void *nativeObject = nullptr;
  napi_finalize finalizer = nullptr;
  void *finalizerHint = nullptr;

  // Constructor with default type
  JSValue(JSType t = JSType::UNDEFINED) : type(t)
  {
    switch (type)
    {
    case JSType::BOOLEAN:
      data = false;
      break;
    case JSType::NUMBER:
      data = 0.0;
      break;
    case JSType::STRING:
      data = std::string();
      break;
    case JSType::OBJECT:
      data = std::unordered_map<std::string, JSValuePtr>();
      break;
    case JSType::ARRAY:
      data = std::vector<JSValuePtr>();
      break;
    case JSType::BUFFER:
      data = std::vector<uint8_t>();
      break;
    case JSType::EXTERNAL:
      data = nullptr;
      break;
    case JSType::FUNCTION:
      data = NativeCallback();
      break;
    default:
      // Other types don't need initialization
      break;
    }
  }

  // Destructor to call finalizer if set
  ~JSValue()
  {
    if (finalizer && nativeObject)
    {
      finalizer(nullptr, nativeObject, finalizerHint);
    }
  }

  // Helper methods for property access
  bool setProperty(const std::string &name, JSValuePtr value)
  {
    if (type != JSType::OBJECT && type != JSType::ARRAY)
    {
      return false;
    }

    auto &properties = std::get<std::unordered_map<std::string, JSValuePtr>>(data);
    properties[name] = value;
    return true;
  }

  JSValuePtr getProperty(const std::string &name)
  {
    if (type != JSType::OBJECT && type != JSType::ARRAY)
    {
      return nullptr;
    }

    auto &properties = std::get<std::unordered_map<std::string, JSValuePtr>>(data);
    auto it = properties.find(name);
    if (it != properties.end())
    {
      return it->second;
    }
    return nullptr;
  }

  bool hasProperty(const std::string &name)
  {
    if (type != JSType::OBJECT && type != JSType::ARRAY)
    {
      return false;
    }

    auto &properties = std::get<std::unordered_map<std::string, JSValuePtr>>(data);
    return properties.find(name) != properties.end();
  }

  // Array element access
  bool setElement(uint32_t index, JSValuePtr value)
  {
    if (type != JSType::ARRAY)
    {
      return false;
    }

    auto &elements = std::get<std::vector<JSValuePtr>>(data);
    if (index >= elements.size())
    {
      elements.resize(index + 1);
    }
    elements[index] = value;
    return true;
  }

  JSValuePtr getElement(uint32_t index)
  {
    if (type != JSType::ARRAY)
    {
      return nullptr;
    }

    auto &elements = std::get<std::vector<JSValuePtr>>(data);
    if (index < elements.size())
    {
      return elements[index];
    }
    return nullptr;
  }

  bool hasElement(uint32_t index)
  {
    if (type != JSType::ARRAY)
    {
      return false;
    }

    auto &elements = std::get<std::vector<JSValuePtr>>(data);
    return index < elements.size() && elements[index] != nullptr;
  }

  // Buffer data access
  uint8_t *getBufferData()
  {
    if (type != JSType::BUFFER)
    {
      return nullptr;
    }

    auto &buffer = std::get<std::vector<uint8_t>>(data);
    return buffer.data();
  }

  size_t getBufferLength()
  {
    if (type != JSType::BUFFER)
    {
      return 0;
    }

    auto &buffer = std::get<std::vector<uint8_t>>(data);
    return buffer.size();
  }
};

// Conversion helpers
JSValuePtr getJSValue(napi_value value)
{
  return *reinterpret_cast<JSValuePtr *>(value);
}

napi_value getNapiValue(JSValuePtr value)
{
  return reinterpret_cast<napi_value>(new JSValuePtr(value));
}

// Now implement the N-API functions using our mock environment

extern "C"
{
  // Core object creation functions
  NAPI_MOCK_EXTERN napi_status napi_create_object(napi_env env, napi_value *result)
  {
    auto jsValue = g_env.createValue(JSType::OBJECT);
    *result = getNapiValue(jsValue);
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_create_array(napi_env env, napi_value *result)
  {
    auto jsValue = g_env.createValue(JSType::ARRAY);
    *result = getNapiValue(jsValue);
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_create_array_with_length(napi_env env, size_t length, napi_value *result)
  {
    auto jsValue = g_env.createValue(JSType::ARRAY);
    auto &array = std::get<std::vector<JSValuePtr>>(jsValue->data);
    array.resize(length);
    *result = getNapiValue(jsValue);
    return napi_ok;
  }

  // Array operations
  NAPI_MOCK_EXTERN napi_status napi_get_array_length(napi_env env, napi_value value, uint32_t *result)
  {
    auto jsValue = getJSValue(value);
    if (jsValue->type != JSType::ARRAY)
    {
      return napi_array_expected;
    }

    auto &array = std::get<std::vector<JSValuePtr>>(jsValue->data);
    *result = static_cast<uint32_t>(array.size());
    return napi_ok;
  }

  // Object property operations
  NAPI_MOCK_EXTERN napi_status napi_set_property(napi_env env, napi_value object, napi_value key, napi_value value)
  {
    auto jsObject = getJSValue(object);
    auto jsKey = getJSValue(key);
    auto jsValue = getJSValue(value);

    if (jsObject->type != JSType::OBJECT && jsObject->type != JSType::ARRAY)
    {
      return napi_object_expected;
    }

    if (jsKey->type != JSType::STRING)
    {
      return napi_string_expected;
    }

    auto &keyStr = std::get<std::string>(jsKey->data);
    jsObject->setProperty(keyStr, jsValue);
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_get_property(napi_env env, napi_value object, napi_value key, napi_value *result)
  {
    auto jsObject = getJSValue(object);
    auto jsKey = getJSValue(key);

    if (jsObject->type != JSType::OBJECT && jsObject->type != JSType::ARRAY)
    {
      return napi_object_expected;
    }

    if (jsKey->type != JSType::STRING)
    {
      return napi_string_expected;
    }

    auto &keyStr = std::get<std::string>(jsKey->data);
    auto value = jsObject->getProperty(keyStr);

    if (!value)
    {
      // Return undefined if property doesn't exist
      auto undefined = g_env.createValue(JSType::UNDEFINED);
      *result = getNapiValue(undefined);
    }
    else
    {
      *result = getNapiValue(value);
    }

    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_has_property(napi_env env, napi_value object, napi_value key, bool *result)
  {
    auto jsObject = getJSValue(object);
    auto jsKey = getJSValue(key);

    if (jsObject->type != JSType::OBJECT && jsObject->type != JSType::ARRAY)
    {
      return napi_object_expected;
    }

    if (jsKey->type != JSType::STRING)
    {
      return napi_string_expected;
    }

    auto &keyStr = std::get<std::string>(jsKey->data);
    *result = jsObject->hasProperty(keyStr);
    return napi_ok;
  }

  // Named property operations (the ones you specifically asked about)
  NAPI_MOCK_EXTERN napi_status napi_set_named_property(napi_env env, napi_value object, const char *name, napi_value value)
  {
    auto jsObject = getJSValue(object);
    auto jsValue = getJSValue(value);

    if (jsObject->type != JSType::OBJECT && jsObject->type != JSType::ARRAY)
    {
      return napi_object_expected;
    }

    jsObject->setProperty(name, jsValue);
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_get_named_property(napi_env env, napi_value object, const char *name, napi_value *result)
  {
    auto jsObject = getJSValue(object);

    if (jsObject->type != JSType::OBJECT && jsObject->type != JSType::ARRAY)
    {
      return napi_object_expected;
    }

    auto value = jsObject->getProperty(name);

    if (!value)
    {
      // Return undefined if property doesn't exist
      auto undefined = g_env.createValue(JSType::UNDEFINED);
      *result = getNapiValue(undefined);
    }
    else
    {
      *result = getNapiValue(value);
    }

    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_has_named_property(napi_env env, napi_value object, const char *name, bool *result)
  {
    auto jsObject = getJSValue(object);

    if (jsObject->type != JSType::OBJECT && jsObject->type != JSType::ARRAY)
    {
      return napi_object_expected;
    }

    *result = jsObject->hasProperty(name);
    return napi_ok;
  }

  // Element operations
  NAPI_MOCK_EXTERN napi_status napi_set_element(napi_env env, napi_value object, uint32_t index, napi_value value)
  {
    auto jsObject = getJSValue(object);
    auto jsValue = getJSValue(value);

    if (jsObject->type != JSType::ARRAY)
    {
      return napi_array_expected;
    }

    jsObject->setElement(index, jsValue);
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_get_element(napi_env env, napi_value object, uint32_t index, napi_value *result)
  {
    auto jsObject = getJSValue(object);

    if (jsObject->type != JSType::ARRAY)
    {
      return napi_array_expected;
    }

    auto value = jsObject->getElement(index);

    if (!value)
    {
      // Return undefined if element doesn't exist
      auto undefined = g_env.createValue(JSType::UNDEFINED);
      *result = getNapiValue(undefined);
    }
    else
    {
      *result = getNapiValue(value);
    }

    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_has_element(napi_env env, napi_value object, uint32_t index, bool *result)
  {
    auto jsObject = getJSValue(object);

    if (jsObject->type != JSType::ARRAY)
    {
      return napi_array_expected;
    }

    *result = jsObject->hasElement(index);
    return napi_ok;
  }

  // Value creation functions
  NAPI_MOCK_EXTERN napi_status napi_create_string_utf8(napi_env env, const char *str, size_t length, napi_value *result)
  {
    auto jsString = g_env.createValue(JSType::STRING);

    size_t actualLength = (length == NAPI_AUTO_LENGTH) ? strlen(str) : length;
    std::get<std::string>(jsString->data) = std::string(str, actualLength);

    *result = getNapiValue(jsString);
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_create_double(napi_env env, double value, napi_value *result)
  {
    auto jsNumber = g_env.createValue(JSType::NUMBER);
    std::get<double>(jsNumber->data) = value;
    *result = getNapiValue(jsNumber);
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_get_boolean(napi_env env, bool value, napi_value *result)
  {
    auto jsBoolean = g_env.createValue(JSType::BOOLEAN);
    std::get<bool>(jsBoolean->data) = value;
    *result = getNapiValue(jsBoolean);
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_get_null(napi_env env, napi_value *result)
  {
    auto jsNull = g_env.createValue(JSType::NULL_TYPE);
    *result = getNapiValue(jsNull);
    return napi_ok;
  }

  // Value extraction functions
  NAPI_MOCK_EXTERN napi_status napi_get_value_string_utf8(napi_env env, napi_value value, char *buf, size_t bufsize, size_t *result)
  {
    auto jsValue = getJSValue(value);

    if (jsValue->type != JSType::STRING)
    {
      return napi_string_expected;
    }

    auto &str = std::get<std::string>(jsValue->data);
    size_t toCopy = std::min(str.length(), bufsize - 1);

    if (buf && bufsize > 0)
    {
      strncpy(buf, str.c_str(), toCopy);
      buf[toCopy] = '\0';
    }

    if (result)
    {
      *result = str.length();
    }

    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_get_value_double(napi_env env, napi_value value, double *result)
  {
    auto jsValue = getJSValue(value);

    if (jsValue->type != JSType::NUMBER)
    {
      return napi_number_expected;
    }

    *result = std::get<double>(jsValue->data);
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_get_value_bool(napi_env env, napi_value value, bool *result)
  {
    auto jsValue = getJSValue(value);

    if (jsValue->type != JSType::BOOLEAN)
    {
      return napi_boolean_expected;
    }

    *result = std::get<bool>(jsValue->data);
    return napi_ok;
  }

  // Type checking
  NAPI_MOCK_EXTERN napi_status napi_typeof(napi_env env, napi_value value, napi_valuetype *result)
  {
    auto jsValue = getJSValue(value);

    switch (jsValue->type)
    {
    case JSType::UNDEFINED:
      *result = napi_undefined;
      break;
    case JSType::NULL_TYPE:
      *result = napi_null;
      break;
    case JSType::BOOLEAN:
      *result = napi_boolean;
      break;
    case JSType::NUMBER:
      *result = napi_number;
      break;
    case JSType::STRING:
      *result = napi_string;
      break;
    case JSType::OBJECT:
      *result = napi_object;
      break;
    case JSType::FUNCTION:
      *result = napi_function;
      break;
    case JSType::EXTERNAL:
      *result = napi_external;
      break;
    default:
      *result = napi_undefined;
      break;
    }

    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_is_array(napi_env env, napi_value value, bool *result)
  {
    auto jsValue = getJSValue(value);
    *result = (jsValue->type == JSType::ARRAY);
    return napi_ok;
  }

  // Function creation and invocation
  NAPI_MOCK_EXTERN napi_status napi_create_function(napi_env env, const char *utf8name, size_t length, napi_callback cb, void *data, napi_value *result)
  {
    auto jsFunction = g_env.createValue(JSType::FUNCTION);

    // Store the callback function
    std::get<NativeCallback>(jsFunction->data) = [cb, data](napi_env env, napi_callback_info info)
    {
      return cb(env, info);
    };

    // Store function name as a property
    if (utf8name)
    {
      size_t nameLength = (length == NAPI_AUTO_LENGTH) ? strlen(utf8name) : length;
      auto jsName = g_env.createValue(JSType::STRING);
      std::get<std::string>(jsName->data) = std::string(utf8name, nameLength);
      jsFunction->setProperty("name", jsName);
    }

    *result = getNapiValue(jsFunction);
    return napi_ok;
  }

  // Wrap/unwrap
  NAPI_MOCK_EXTERN napi_status napi_wrap(napi_env env, napi_value js_object, void *native_object, napi_finalize finalize_cb, void *finalize_hint, napi_ref *result)
  {
    auto jsObject = getJSValue(js_object);

    if (jsObject->type != JSType::OBJECT)
    {
      return napi_object_expected;
    }

    jsObject->nativeObject = native_object;
    jsObject->finalizer = finalize_cb;
    jsObject->finalizerHint = finalize_hint;

    if (result)
    {
      // Create a reference to the object
      *result = reinterpret_cast<napi_ref>(new napi_ref__(js_object));
    }

    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_unwrap(napi_env env, napi_value js_object, void **result)
  {
    auto jsObject = getJSValue(js_object);

    if (jsObject->type != JSType::OBJECT)
    {
      return napi_object_expected;
    }

    if (result)
    {
      *result = jsObject->nativeObject;
    }

    return napi_ok;
  }

  // Additional functions as needed...
  // Add implementations for other N-API functions following the same pattern

  // Reference management methods use the already defined napi_ref__ structure

  NAPI_MOCK_EXTERN napi_status napi_create_reference(napi_env env, napi_value value, uint32_t initial_refcount, napi_ref *result)
  {
    *result = reinterpret_cast<napi_ref>(new napi_ref__(value));
    reinterpret_cast<napi_ref__ *>(*result)->refcount = initial_refcount;
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_delete_reference(napi_env env, napi_ref ref)
  {
    delete reinterpret_cast<napi_ref__ *>(ref);
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_reference_ref(napi_env env, napi_ref ref, uint32_t *result)
  {
    auto reference = reinterpret_cast<napi_ref__ *>(ref);
    reference->refcount++;
    if (result)
    {
      *result = reference->refcount;
    }
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_reference_unref(napi_env env, napi_ref ref, uint32_t *result)
  {
    auto reference = reinterpret_cast<napi_ref__ *>(ref);
    if (reference->refcount > 0)
    {
      reference->refcount--;
    }
    if (result)
    {
      *result = reference->refcount;
    }
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_get_reference_value(napi_env env, napi_ref ref, napi_value *result)
  {
    auto reference = reinterpret_cast<napi_ref__ *>(ref);
    *result = reference->value;
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_call_function(napi_env env, napi_value recv, napi_value func, size_t argc, const napi_value *argv, napi_value *result)
  {
    if (result)
      *result = (napi_value)malloc(1);
    return napi_ok;
  }

  // Promise operations
  NAPI_MOCK_EXTERN napi_status napi_create_promise(napi_env env, napi_deferred *deferred, napi_value *promise)
  {
    if (deferred)
      *deferred = (napi_deferred)malloc(1);
    if (promise)
      *promise = (napi_value)malloc(1);
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_resolve_deferred(napi_env env, napi_deferred deferred, napi_value resolution)
  {
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_reject_deferred(napi_env env, napi_deferred deferred, napi_value rejection)
  {
    return napi_ok;
  }

  // Implementation for napi_get_last_error_info
  NAPI_MOCK_EXTERN napi_status napi_get_last_error_info(napi_env env, const napi_extended_error_info **result)
  {
    static napi_extended_error_info errorInfo = {0};
    if (result)
    {
      *result = &errorInfo;
    }
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_create_error(napi_env env, napi_value code, napi_value msg, napi_value *result)
  {
    if (result)
      *result = (napi_value)malloc(1);
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_create_type_error(napi_env env, napi_value code, napi_value msg, napi_value *result)
  {
    if (result)
      *result = (napi_value)malloc(1);
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_throw(napi_env env, napi_value error)
  {
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_throw_error(napi_env env, const char *code, const char *msg)
  {
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_throw_type_error(napi_env env, const char *code, const char *msg)
  {
    return napi_ok;
  }

  void napi_fatal_error(const char *, size_t, const char *, size_t)
  {
    // In a real environment, this would terminate the process
    // For testing, we'll throw an exception to simulate fatal error
    throw std::runtime_error("NAPI Fatal Error");
  }

  NAPI_MOCK_EXTERN napi_status napi_get_cb_info(napi_env env, napi_callback_info cbinfo, size_t *argc, napi_value *argv, napi_value *this_arg, void **data)
  {
    if (argc)
      *argc = 0;
    if (this_arg)
      *this_arg = (napi_value)malloc(1);
    if (data)
      *data = nullptr;
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_open_handle_scope(napi_env env, napi_handle_scope *result)
  {
    if (result)
      *result = (napi_handle_scope)malloc(1);
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_close_handle_scope(napi_env env, napi_handle_scope scope)
  {
    if (scope)
      free(scope);
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_open_escapable_handle_scope(napi_env env, napi_escapable_handle_scope *result)
  {
    if (result)
      *result = (napi_escapable_handle_scope)malloc(1);
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_close_escapable_handle_scope(napi_env env, napi_escapable_handle_scope scope)
  {
    if (scope)
      free(scope);
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_escape_handle(napi_env env, napi_escapable_handle_scope scope, napi_value escapee, napi_value *result)
  {
    if (result)
      *result = escapee;
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_new_instance(napi_env env, napi_value constructor, size_t argc, const napi_value *argv, napi_value *result)
  {
    if (result)
      *result = (napi_value)malloc(1);
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_is_buffer(napi_env env, napi_value value, bool *result)
  {
    if (result)
      *result = false;
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_is_date(napi_env env, napi_value value, bool *result)
  {
    if (result)
      *result = false;
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_is_error(napi_env env, napi_value value, bool *result)
  {
    if (result)
      *result = false;
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_is_typedarray(napi_env env, napi_value value, bool *result)
  {
    if (result)
      *result = false;
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_create_string_latin1(napi_env env, const char *str, size_t length, napi_value *result)
  {
    if (result)
      *result = (napi_value)malloc(1);
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_get_value_int32(napi_env env, napi_value value, int32_t *result)
  {
    if (result)
      *result = 0;
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_get_value_int64(napi_env env, napi_value value, int64_t *result)
  {
    if (result)
      *result = 0;
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_get_value_uint32(napi_env env, napi_value value, uint32_t *result)
  {
    if (result)
      *result = 0;
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_get_date_value(napi_env env, napi_value value, double *result)
  {
    if (result)
      *result = 0;
    return napi_ok;
  }

  // ObjectWrap operations
  NAPI_MOCK_EXTERN napi_status napi_define_class(napi_env env, const char *utf8name, size_t length, napi_callback constructor, void *data, size_t property_count, const napi_property_descriptor *properties, napi_value *result)
  {
    if (result)
      *result = (napi_value)malloc(1);
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_remove_wrap(napi_env env, napi_value js_object, void **result)
  {
    if (result)
      *result = nullptr;
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_add_finalizer(napi_env env, napi_value js_object, void *native_object, napi_finalize finalize_cb, void *finalize_hint, napi_ref *result)
  {
    if (result)
      *result = (napi_ref)malloc(1);
    return napi_ok;
  }

  // Async work
  NAPI_MOCK_EXTERN napi_status napi_create_async_work(napi_env env, napi_value async_resource, napi_value async_resource_name, napi_async_execute_callback execute, napi_async_complete_callback complete, void *data, napi_async_work *result)
  {
    if (result)
      *result = (napi_async_work)malloc(1);
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_delete_async_work(napi_env env, napi_async_work work)
  {
    if (work)
      free(work);
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_queue_async_work(napi_env env, napi_async_work work)
  {
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_async_destroy(napi_env env, napi_async_context async_context)
  {
    return napi_ok;
  }

  // Buffer operations
  NAPI_MOCK_EXTERN napi_status napi_create_buffer(napi_env env, size_t size, void **data, napi_value *result)
  {
    if (data)
      *data = malloc(size);
    if (result)
      *result = (napi_value)malloc(1);
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_create_buffer_copy(napi_env env, size_t size, const void *data, void **result_data, napi_value *result)
  {
    if (result_data)
    {
      *result_data = malloc(size);
      if (data && *result_data)
        memcpy(*result_data, data, size);
    }
    if (result)
      *result = (napi_value)malloc(1);
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_get_buffer_info(napi_env env, napi_value value, void **data, size_t *length)
  {
    if (data)
      *data = nullptr;
    if (length)
      *length = 0;
    return napi_ok;
  }

  // TypedArray operations
  NAPI_MOCK_EXTERN napi_status napi_get_typedarray_info(napi_env env, napi_value typedarray, napi_typedarray_type *type, size_t *length, void **data, napi_value *arraybuffer, size_t *byte_offset)
  {
    if (type)
      *type = napi_uint8_array;
    if (length)
      *length = 0;
    if (data)
      *data = nullptr;
    if (arraybuffer)
      *arraybuffer = (napi_value)malloc(1);
    if (byte_offset)
      *byte_offset = 0;
    return napi_ok;
  }

  // String operations
  NAPI_MOCK_EXTERN napi_status napi_coerce_to_string(napi_env env, napi_value value, napi_value *result)
  {
    if (result)
      *result = (napi_value)malloc(1);
    return napi_ok;
  }

  // Instance checking
  NAPI_MOCK_EXTERN napi_status napi_get_new_target(napi_env env, napi_callback_info cbinfo, napi_value *result)
  {
    if (result)
      *result = (napi_value)malloc(1);
    return napi_ok;
  }

  // Exception handling
  NAPI_MOCK_EXTERN napi_status napi_is_exception_pending(napi_env env, bool *result)
  {
    if (result)
      *result = false;
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_get_and_clear_last_exception(napi_env env, napi_value *result)
  {
    if (result)
      *result = (napi_value)malloc(1);
    return napi_ok;
  }

  // Callback scope
  NAPI_MOCK_EXTERN napi_status napi_close_callback_scope(napi_env env, napi_callback_scope scope)
  {
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_define_properties(napi_env env,
                                                      napi_value object,
                                                      size_t property_count,
                                                      const napi_property_descriptor *properties)
  {
    return napi_ok;
  }

  // Add this with the other NAPI function implementations
  NAPI_MOCK_EXTERN napi_status napi_get_undefined(napi_env env, napi_value *result)
  {
    if (!result)
    {
      return napi_invalid_arg;
    }
    auto jsUndefined = g_env.createValue(JSType::UNDEFINED);
    *result = getNapiValue(jsUndefined);
    return napi_ok;
  }

  // Implementation for other functions can be added as needed...

  // Add stubs for remaining N-API functions to ensure compilation
  // These can be expanded with real implementations as needed

  // Implementation for napi_create_string_utf16
  NAPI_MOCK_EXTERN napi_status napi_create_string_utf16(napi_env env, const char16_t *str, size_t length, napi_value *result)
  {
    // Create a string value (we'll use regular string for our mock)
    auto jsString = g_env.createValue(JSType::STRING);

    // For simplified mocking, we'll just convert the utf16 to a regular string
    // In a real implementation, this would preserve the UTF-16 encoding
    size_t actualLength = (length == NAPI_AUTO_LENGTH) ? 0 : length;
    std::string utf8String;

    // If length is auto, find the actual length
    if (length == NAPI_AUTO_LENGTH)
    {
      const char16_t *s = str;
      while (*s)
      {
        actualLength++;
        s++;
      }
    }

    // Simple conversion from UTF-16 to ASCII/UTF-8 for mocking purposes
    for (size_t i = 0; i < actualLength; i++)
    {
      // Just take the lower byte for simplicity in this mock
      utf8String.push_back(static_cast<char>(str[i] & 0xFF));
    }

    std::get<std::string>(jsString->data) = utf8String;
    *result = getNapiValue(jsString);
    return napi_ok;
  }

  // Add these functions before the end of the file
  NAPI_MOCK_EXTERN napi_status napi_get_value_string_utf16(napi_env env, napi_value value, char16_t *buf, size_t bufsize, size_t *result)
  {
    auto jsValue = getJSValue(value);
    if (!jsValue || jsValue->type != JSType::STRING)
    {
      return napi_string_expected;
    }

    auto &str = std::get<std::string>(jsValue->data);
    if (buf == nullptr)
    {
      *result = str.length();
      return napi_ok;
    }

    size_t len = std::min(str.length(), bufsize - 1);
    for (size_t i = 0; i < len; i++)
    {
      buf[i] = static_cast<char16_t>(str[i]);
    }
    buf[len] = 0;
    *result = len;
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_create_bigint_int64(napi_env env, int64_t value, napi_value *result)
  {
    auto jsValue = g_env.createValue(JSType::NUMBER);
    jsValue->data = static_cast<double>(value);
    *result = getNapiValue(jsValue);
    return napi_ok;
  }

  NAPI_MOCK_EXTERN napi_status napi_create_date(napi_env env, double value, napi_value *result)
  {
    auto jsValue = g_env.createValue(JSType::NUMBER);
    jsValue->data = value;
    *result = getNapiValue(jsValue);
    return napi_ok;
  }
}

#else
// If we're using the real NAPI, we should only define functions that aren't in the real implementation
// For example, helper functions that aren't part of the NAPI interface
#endif