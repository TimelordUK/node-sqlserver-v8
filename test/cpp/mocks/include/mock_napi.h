#pragma once

#ifdef MOCK_NAPI

#include <node_api.h>

#ifdef _WIN32
#ifdef BUILDING_MOCK_NAPI
#define NAPI_MOCK_EXTERN __declspec(dllexport)
#else
#define NAPI_MOCK_EXTERN __declspec(dllimport)
#endif
#else
#define NAPI_MOCK_EXTERN __attribute__((visibility("default")))
#endif

#ifdef __cplusplus
extern "C"
{
#endif

  // Core NAPI functions
  NAPI_MOCK_EXTERN napi_status napi_create_object(napi_env env, napi_value *result);
  NAPI_MOCK_EXTERN napi_status napi_create_array(napi_env env, napi_value *result);
  NAPI_MOCK_EXTERN napi_status napi_create_array_with_length(napi_env env, size_t length, napi_value *result);
  NAPI_MOCK_EXTERN napi_status napi_get_array_length(napi_env env, napi_value value, uint32_t *result);

  // Property manipulation
  NAPI_MOCK_EXTERN napi_status napi_set_property(napi_env env, napi_value object, napi_value key, napi_value value);
  NAPI_MOCK_EXTERN napi_status napi_get_property(napi_env env, napi_value object, napi_value key, napi_value *result);
  NAPI_MOCK_EXTERN napi_status napi_has_property(napi_env env, napi_value object, napi_value key, bool *result);
  NAPI_MOCK_EXTERN napi_status napi_set_named_property(napi_env env, napi_value object, const char *name, napi_value value);
  NAPI_MOCK_EXTERN napi_status napi_get_named_property(napi_env env, napi_value object, const char *name, napi_value *result);
  NAPI_MOCK_EXTERN napi_status napi_has_named_property(napi_env env, napi_value object, const char *name, bool *result);
  NAPI_MOCK_EXTERN napi_status napi_set_element(napi_env env, napi_value object, uint32_t index, napi_value value);
  NAPI_MOCK_EXTERN napi_status napi_get_element(napi_env env, napi_value object, uint32_t index, napi_value *result);
  NAPI_MOCK_EXTERN napi_status napi_has_element(napi_env env, napi_value object, uint32_t index, bool *result);

  // Value creation
  NAPI_MOCK_EXTERN napi_status napi_create_string_utf8(napi_env env, const char *str, size_t length, napi_value *result);
  NAPI_MOCK_EXTERN napi_status napi_create_string_utf16(napi_env env, const char16_t *str, size_t length, napi_value *result);
  NAPI_MOCK_EXTERN napi_status napi_create_double(napi_env env, double value, napi_value *result);
  NAPI_MOCK_EXTERN napi_status napi_get_boolean(napi_env env, bool value, napi_value *result);
  NAPI_MOCK_EXTERN napi_status napi_get_undefined(napi_env env, napi_value *result);
  NAPI_MOCK_EXTERN napi_status napi_get_null(napi_env env, napi_value *result);

  // Value extraction
  NAPI_MOCK_EXTERN napi_status napi_get_value_string_utf8(napi_env env, napi_value value, char *buf, size_t bufsize, size_t *result);
  NAPI_MOCK_EXTERN napi_status napi_get_value_double(napi_env env, napi_value value, double *result);
  NAPI_MOCK_EXTERN napi_status napi_get_value_bool(napi_env env, napi_value value, bool *result);
  NAPI_MOCK_EXTERN napi_status napi_get_value_int32(napi_env env, napi_value value, int32_t *result);
  NAPI_MOCK_EXTERN napi_status napi_get_value_int64(napi_env env, napi_value value, int64_t *result);
  NAPI_MOCK_EXTERN napi_status napi_get_value_uint32(napi_env env, napi_value value, uint32_t *result);

  // Type checking
  NAPI_MOCK_EXTERN napi_status napi_typeof(napi_env env, napi_value value, napi_valuetype *result);
  NAPI_MOCK_EXTERN napi_status napi_is_array(napi_env env, napi_value value, bool *result);
  NAPI_MOCK_EXTERN napi_status napi_is_buffer(napi_env env, napi_value value, bool *result);
  NAPI_MOCK_EXTERN napi_status napi_is_date(napi_env env, napi_value value, bool *result);
  NAPI_MOCK_EXTERN napi_status napi_is_error(napi_env env, napi_value value, bool *result);
  NAPI_MOCK_EXTERN napi_status napi_is_typedarray(napi_env env, napi_value value, bool *result);

  // Function handling
  NAPI_MOCK_EXTERN napi_status napi_create_function(napi_env env, const char *utf8name, size_t length, napi_callback cb, void *data, napi_value *result);
  NAPI_MOCK_EXTERN napi_status napi_call_function(napi_env env, napi_value recv, napi_value func, size_t argc, const napi_value *argv, napi_value *result);
  NAPI_MOCK_EXTERN napi_status napi_get_cb_info(napi_env env, napi_callback_info cbinfo, size_t *argc, napi_value *argv, napi_value *this_arg, void **data);

  // Object wrapping
  NAPI_MOCK_EXTERN napi_status napi_wrap(napi_env env, napi_value js_object, void *native_object, napi_finalize finalize_cb, void *finalize_hint, napi_ref *result);
  NAPI_MOCK_EXTERN napi_status napi_unwrap(napi_env env, napi_value js_object, void **result);
  NAPI_MOCK_EXTERN napi_status napi_remove_wrap(napi_env env, napi_value js_object, void **result);

  // Reference handling
  NAPI_MOCK_EXTERN napi_status napi_create_reference(napi_env env, napi_value value, uint32_t initial_refcount, napi_ref *result);
  NAPI_MOCK_EXTERN napi_status napi_delete_reference(napi_env env, napi_ref ref);
  NAPI_MOCK_EXTERN napi_status napi_reference_ref(napi_env env, napi_ref ref, uint32_t *result);
  NAPI_MOCK_EXTERN napi_status napi_reference_unref(napi_env env, napi_ref ref, uint32_t *result);
  NAPI_MOCK_EXTERN napi_status napi_get_reference_value(napi_env env, napi_ref ref, napi_value *result);

  // Promise APIs
  NAPI_MOCK_EXTERN napi_status napi_create_promise(napi_env env, napi_deferred *deferred, napi_value *promise);
  NAPI_MOCK_EXTERN napi_status napi_resolve_deferred(napi_env env, napi_deferred deferred, napi_value resolution);
  NAPI_MOCK_EXTERN napi_status napi_reject_deferred(napi_env env, napi_deferred deferred, napi_value rejection);

  // Error handling
  NAPI_MOCK_EXTERN napi_status napi_get_last_error_info(napi_env env, const napi_extended_error_info **result);
  NAPI_MOCK_EXTERN napi_status napi_create_error(napi_env env, napi_value code, napi_value msg, napi_value *result);
  NAPI_MOCK_EXTERN napi_status napi_create_type_error(napi_env env, napi_value code, napi_value msg, napi_value *result);
  NAPI_MOCK_EXTERN napi_status napi_throw(napi_env env, napi_value error);
  NAPI_MOCK_EXTERN napi_status napi_throw_error(napi_env env, const char *code, const char *msg);
  NAPI_MOCK_EXTERN napi_status napi_throw_type_error(napi_env env, const char *code, const char *msg);
  NAPI_MOCK_EXTERN napi_status napi_is_exception_pending(napi_env env, bool *result);
  NAPI_MOCK_EXTERN napi_status napi_get_and_clear_last_exception(napi_env env, napi_value *result);

  // Buffer handling
  NAPI_MOCK_EXTERN napi_status napi_create_buffer(napi_env env, size_t size, void **data, napi_value *result);
  NAPI_MOCK_EXTERN napi_status napi_create_buffer_copy(napi_env env, size_t size, const void *data, void **result_data, napi_value *result);
  NAPI_MOCK_EXTERN napi_status napi_get_buffer_info(napi_env env, napi_value value, void **data, size_t *length);

  // TypedArray support
  NAPI_MOCK_EXTERN napi_status napi_get_typedarray_info(napi_env env, napi_value typedarray, napi_typedarray_type *type, size_t *length, void **data, napi_value *arraybuffer, size_t *byte_offset);

  // Scope handling
  NAPI_MOCK_EXTERN napi_status napi_open_handle_scope(napi_env env, napi_handle_scope *result);
  NAPI_MOCK_EXTERN napi_status napi_close_handle_scope(napi_env env, napi_handle_scope scope);
  NAPI_MOCK_EXTERN napi_status napi_open_escapable_handle_scope(napi_env env, napi_escapable_handle_scope *result);
  NAPI_MOCK_EXTERN napi_status napi_close_escapable_handle_scope(napi_env env, napi_escapable_handle_scope scope);
  NAPI_MOCK_EXTERN napi_status napi_escape_handle(napi_env env, napi_escapable_handle_scope scope, napi_value escapee, napi_value *result);

  // Async work
  NAPI_MOCK_EXTERN napi_status napi_create_async_work(napi_env env, napi_value async_resource, napi_value async_resource_name, napi_async_execute_callback execute, napi_async_complete_callback complete, void *data, napi_async_work *result);
  NAPI_MOCK_EXTERN napi_status napi_delete_async_work(napi_env env, napi_async_work work);
  NAPI_MOCK_EXTERN napi_status napi_queue_async_work(napi_env env, napi_async_work work);
  NAPI_MOCK_EXTERN napi_status napi_async_destroy(napi_env env, napi_async_context async_context);

  // Other utilities
  NAPI_MOCK_EXTERN napi_status napi_coerce_to_string(napi_env env, napi_value value, napi_value *result);
  NAPI_MOCK_EXTERN napi_status napi_get_new_target(napi_env env, napi_callback_info cbinfo, napi_value *result);
  NAPI_MOCK_EXTERN napi_status napi_close_callback_scope(napi_env env, napi_callback_scope scope);
  NAPI_MOCK_EXTERN napi_status napi_define_properties(napi_env env, napi_value object, size_t property_count, const napi_property_descriptor *properties);

#ifdef __cplusplus
}
#endif

#endif // MOCK_NAPI