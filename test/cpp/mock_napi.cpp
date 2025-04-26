// Comprehensive mocks for N-API functions
#include <node_api.h>
#include <cstring>
#include <cstdlib>
#include <cstdint>

extern "C" {
    // Core object creation functions
    napi_status napi_create_object(napi_env env, napi_value* result) {
        if (result) *result = (napi_value)malloc(1);
        return napi_ok;
    }
    
    napi_status napi_create_array(napi_env env, napi_value* result) {
        if (result) *result = (napi_value)malloc(1);
        return napi_ok;
    }
    
    napi_status napi_create_array_with_length(napi_env env, size_t length, napi_value* result) {
        if (result) *result = (napi_value)malloc(1);
        return napi_ok;
    }
    
    // Array operations
    napi_status napi_get_array_length(napi_env env, napi_value value, uint32_t* result) {
        if (result) *result = 0;
        return napi_ok;
    }
    
    // Function operations
    napi_status napi_create_function(napi_env env, const char* utf8name, size_t length, napi_callback cb, void* data, napi_value* result) {
        if (result) *result = (napi_value)malloc(1);
        return napi_ok;
    }
    
    napi_status napi_call_function(napi_env env, napi_value recv, napi_value func, size_t argc, const napi_value* argv, napi_value* result) {
        if (result) *result = (napi_value)malloc(1);
        return napi_ok;
    }
    
    // Promise operations
    napi_status napi_create_promise(napi_env env, napi_deferred* deferred, napi_value* promise) {
        if (deferred) *deferred = (napi_deferred)malloc(1);
        if (promise) *promise = (napi_value)malloc(1);
        return napi_ok;
    }
    
    napi_status napi_resolve_deferred(napi_env env, napi_deferred deferred, napi_value resolution) {
        return napi_ok;
    }
    
    napi_status napi_reject_deferred(napi_env env, napi_deferred deferred, napi_value rejection) {
        return napi_ok;
    }
    
    // Error operations
    napi_status napi_get_last_error_info(napi_env env, const napi_extended_error_info** result) {
        static napi_extended_error_info info = {0};
        if (result) *result = &info;
        return napi_ok;
    }
    
    napi_status napi_create_error(napi_env env, napi_value code, napi_value msg, napi_value* result) {
        if (result) *result = (napi_value)malloc(1);
        return napi_ok;
    }
    
    napi_status napi_create_type_error(napi_env env, napi_value code, napi_value msg, napi_value* result) {
        if (result) *result = (napi_value)malloc(1);
        return napi_ok;
    }
    
    napi_status napi_throw(napi_env env, napi_value error) {
        return napi_ok;
    }
    
    napi_status napi_throw_error(napi_env env, const char* code, const char* msg) {
        return napi_ok;
    }
    
    napi_status napi_throw_type_error(napi_env env, const char* code, const char* msg) {
        return napi_ok;
    }
    
    void napi_fatal_error(const char*, size_t, const char*, size_t) {
        // In a real environment, this would terminate the process
        // For testing, we'll just return
    }
    
    // Environment/scope operations
    napi_status napi_get_undefined(napi_env env, napi_value* result) {
        if (result) *result = (napi_value)malloc(1);
        return napi_ok;
    }
    
    napi_status napi_get_null(napi_env env, napi_value* result) {
        if (result) *result = (napi_value)malloc(1);
        return napi_ok;
    }
    
    napi_status napi_get_cb_info(napi_env env, napi_callback_info cbinfo, size_t* argc, napi_value* argv, napi_value* this_arg, void** data) {
        if (argc) *argc = 0;
        if (this_arg) *this_arg = (napi_value)malloc(1);
        if (data) *data = nullptr;
        return napi_ok;
    }
    
    napi_status napi_open_handle_scope(napi_env env, napi_handle_scope* result) {
        if (result) *result = (napi_handle_scope)malloc(1);
        return napi_ok;
    }
    
    napi_status napi_close_handle_scope(napi_env env, napi_handle_scope scope) {
        if (scope) free(scope);
        return napi_ok;
    }
    
    napi_status napi_open_escapable_handle_scope(napi_env env, napi_escapable_handle_scope* result) {
        if (result) *result = (napi_escapable_handle_scope)malloc(1);
        return napi_ok;
    }
    
    napi_status napi_close_escapable_handle_scope(napi_env env, napi_escapable_handle_scope scope) {
        if (scope) free(scope);
        return napi_ok;
    }
    
    napi_status napi_escape_handle(napi_env env, napi_escapable_handle_scope scope, napi_value escapee, napi_value* result) {
        if (result) *result = escapee;
        return napi_ok;
    }
    
    napi_status napi_new_instance(napi_env env, napi_value constructor, size_t argc, const napi_value* argv, napi_value* result) {
        if (result) *result = (napi_value)malloc(1);
        return napi_ok;
    }
    
    // Type checking functions
    napi_status napi_typeof(napi_env env, napi_value value, napi_valuetype* result) {
        if (result) *result = napi_undefined;
        return napi_ok;
    }
    
    napi_status napi_is_array(napi_env env, napi_value value, bool* result) {
        if (result) *result = false;
        return napi_ok;
    }
    
    napi_status napi_is_buffer(napi_env env, napi_value value, bool* result) {
        if (result) *result = false;
        return napi_ok;
    }
    
    napi_status napi_is_date(napi_env env, napi_value value, bool* result) {
        if (result) *result = false;
        return napi_ok;
    }
    
    napi_status napi_is_error(napi_env env, napi_value value, bool* result) {
        if (result) *result = false;
        return napi_ok;
    }
    
    napi_status napi_is_typedarray(napi_env env, napi_value value, bool* result) {
        if (result) *result = false;
        return napi_ok;
    }
    
    // Value creation functions
    napi_status napi_get_boolean(napi_env env, bool value, napi_value* result) {
        if (result) *result = (napi_value)malloc(1);
        return napi_ok;
    }
    
    napi_status napi_create_double(napi_env env, double value, napi_value* result) {
        if (result) *result = (napi_value)malloc(1);
        return napi_ok;
    }
    
    napi_status napi_create_string_utf8(napi_env env, const char* str, size_t length, napi_value* result) {
        if (result) *result = (napi_value)malloc(1);
        return napi_ok;
    }
    
    napi_status napi_create_string_latin1(napi_env env, const char* str, size_t length, napi_value* result) {
        if (result) *result = (napi_value)malloc(1);
        return napi_ok;
    }
    
    // Value extraction functions
    napi_status napi_get_value_bool(napi_env env, napi_value value, bool* result) {
        if (result) *result = false;
        return napi_ok;
    }
    
    napi_status napi_get_value_double(napi_env env, napi_value value, double* result) {
        if (result) *result = 0.0;
        return napi_ok;
    }
    
    napi_status napi_get_value_int32(napi_env env, napi_value value, int32_t* result) {
        if (result) *result = 0;
        return napi_ok;
    }
    
    napi_status napi_get_value_int64(napi_env env, napi_value value, int64_t* result) {
        if (result) *result = 0;
        return napi_ok;
    }
    
    napi_status napi_get_value_uint32(napi_env env, napi_value value, uint32_t* result) {
        if (result) *result = 0;
        return napi_ok;
    }
    
    napi_status napi_get_value_string_utf8(napi_env env, napi_value value, char* buf, size_t bufsize, size_t* result) {
        if (buf && bufsize > 0) {
            strncpy(buf, "mock string", bufsize - 1);
            buf[bufsize - 1] = '\0';
        }
        if (result) *result = strlen("mock string");
        return napi_ok;
    }
    
    napi_status napi_get_date_value(napi_env env, napi_value value, double* result) {
        if (result) *result = 0;
        return napi_ok;
    }
    
    // Object property operations
    napi_status napi_set_property(napi_env env, napi_value object, napi_value key, napi_value value) {
        return napi_ok;
    }
    
    napi_status napi_get_property(napi_env env, napi_value object, napi_value key, napi_value* result) {
        if (result) *result = (napi_value)malloc(1);
        return napi_ok;
    }
    
    napi_status napi_has_property(napi_env env, napi_value object, napi_value key, bool* result) {
        if (result) *result = false;
        return napi_ok;
    }
    
    napi_status napi_set_element(napi_env env, napi_value object, uint32_t index, napi_value value) {
        return napi_ok;
    }
    
    napi_status napi_get_element(napi_env env, napi_value object, uint32_t index, napi_value* result) {
        if (result) *result = (napi_value)malloc(1);
        return napi_ok;
    }
    
    napi_status napi_has_element(napi_env env, napi_value object, uint32_t index, bool* result) {
        if (result) *result = false;
        return napi_ok;
    }
    
    napi_status napi_set_named_property(napi_env env, napi_value object, const char* name, napi_value value) {
        return napi_ok;
    }
    
    napi_status napi_get_named_property(napi_env env, napi_value object, const char* name, napi_value* result) {
        if (result) *result = (napi_value)malloc(1);
        return napi_ok;
    }
    
    napi_status napi_has_named_property(napi_env env, napi_value object, const char* name, bool* result) {
        if (result) *result = false;
        return napi_ok;
    }
    
    // Reference operations
    napi_status napi_create_reference(napi_env env, napi_value value, uint32_t initial_refcount, napi_ref* result) {
        if (result) *result = (napi_ref)malloc(1);
        return napi_ok;
    }
    
    napi_status napi_delete_reference(napi_env env, napi_ref ref) {
        if (ref) free(ref);
        return napi_ok;
    }
    
    napi_status napi_reference_ref(napi_env env, napi_ref ref, uint32_t* result) {
        if (result) *result = 1;
        return napi_ok;
    }
    
    napi_status napi_reference_unref(napi_env env, napi_ref ref, uint32_t* result) {
        if (result) *result = 0;
        return napi_ok;
    }
    
    napi_status napi_get_reference_value(napi_env env, napi_ref ref, napi_value* result) {
        if (result) *result = (napi_value)malloc(1);
        return napi_ok;
    }
    
    // ObjectWrap operations
    napi_status napi_define_class(napi_env env, const char* utf8name, size_t length, napi_callback constructor, void* data, size_t property_count, const napi_property_descriptor* properties, napi_value* result) {
        if (result) *result = (napi_value)malloc(1);
        return napi_ok;
    }
    
    napi_status napi_wrap(napi_env env, napi_value js_object, void* native_object, napi_finalize finalize_cb, void* finalize_hint, napi_ref* result) {
        if (result) *result = (napi_ref)malloc(1);
        return napi_ok;
    }
    
    napi_status napi_unwrap(napi_env env, napi_value js_object, void** result) {
        if (result) *result = nullptr;
        return napi_ok;
    }
    
    napi_status napi_remove_wrap(napi_env env, napi_value js_object, void** result) {
        if (result) *result = nullptr;
        return napi_ok;
    }
    
    napi_status napi_add_finalizer(napi_env env, napi_value js_object, void* native_object, napi_finalize finalize_cb, void* finalize_hint, napi_ref* result) {
        if (result) *result = (napi_ref)malloc(1);
        return napi_ok;
    }
    
    // Async work
    napi_status napi_create_async_work(napi_env env, napi_value async_resource, napi_value async_resource_name, napi_async_execute_callback execute, napi_async_complete_callback complete, void* data, napi_async_work* result) {
        if (result) *result = (napi_async_work)malloc(1);
        return napi_ok;
    }
    
    napi_status napi_delete_async_work(napi_env env, napi_async_work work) {
        if (work) free(work);
        return napi_ok;
    }
    
    napi_status napi_queue_async_work(napi_env env, napi_async_work work) {
        return napi_ok;
    }
    
    napi_status napi_async_destroy(napi_env env, napi_async_context async_context) {
        return napi_ok;
    }
    
    // Buffer operations
    napi_status napi_create_buffer(napi_env env, size_t size, void** data, napi_value* result) {
        if (data) *data = malloc(size);
        if (result) *result = (napi_value)malloc(1);
        return napi_ok;
    }
    
    napi_status napi_create_buffer_copy(napi_env env, size_t size, const void* data, void** result_data, napi_value* result) {
        if (result_data) {
            *result_data = malloc(size);
            if (data && *result_data) memcpy(*result_data, data, size);
        }
        if (result) *result = (napi_value)malloc(1);
        return napi_ok;
    }
    
    napi_status napi_get_buffer_info(napi_env env, napi_value value, void** data, size_t* length) {
        if (data) *data = nullptr;
        if (length) *length = 0;
        return napi_ok;
    }
    
    // TypedArray operations
    napi_status napi_get_typedarray_info(napi_env env, napi_value typedarray, napi_typedarray_type* type, size_t* length, void** data, napi_value* arraybuffer, size_t* byte_offset) {
        if (type) *type = napi_uint8_array;
        if (length) *length = 0;
        if (data) *data = nullptr;
        if (arraybuffer) *arraybuffer = (napi_value)malloc(1);
        if (byte_offset) *byte_offset = 0;
        return napi_ok;
    }
    
    // String operations
    napi_status napi_coerce_to_string(napi_env env, napi_value value, napi_value* result) {
        if (result) *result = (napi_value)malloc(1);
        return napi_ok;
    }
    
    // Instance checking
    napi_status napi_get_new_target(napi_env env, napi_callback_info cbinfo, napi_value* result) {
        if (result) *result = (napi_value)malloc(1);
        return napi_ok;
    }
    
    // Exception handling
    napi_status napi_is_exception_pending(napi_env env, bool* result) {
        if (result) *result = false;
        return napi_ok;
    }
    
    napi_status napi_get_and_clear_last_exception(napi_env env, napi_value* result) {
        if (result) *result = (napi_value)malloc(1);
        return napi_ok;
    }
    
    // Callback scope
    napi_status napi_close_callback_scope(napi_env env, napi_callback_scope scope) {
        return napi_ok;
    }
}