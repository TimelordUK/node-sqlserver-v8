# ODBC Error Object Fix for N-API Implementation

## Problem

The N-API implementation was not properly constructing JavaScript Error objects for ODBC errors. Instead of receiving proper Error instances with ODBC-specific properties, JavaScript callbacks were receiving plain objects with only a `message` property.

**Expected behavior** (from original driver):
```javascript
err instanceof Error === true
err.sqlstate === "42000"
err.code === 105
err.severity === 15
// etc.
```

**Actual behavior** (broken):
```javascript
err = { "message": "..." }  // Plain object, not an Error
```

## Root Cause Analysis

1. **ODBC Error Detection**: C++ correctly detected ODBC errors and populated error details
2. **Error Details Missing**: The `QueryWorker` wasn't capturing full ODBC error information in `errorDetails_`  
3. **Wrong Object Type**: The `OnError` method was creating plain JavaScript objects instead of Error objects

## Solution

### 1. Capture Full Error Details in QueryWorker

**File**: `cpp/src/js/workers/query_worker.cpp`

**Problem**: Only extracting error message, discarding other ODBC details
```cpp
// Before:
const std::string errorMessage = errors[0]->message;
SetError(errorMessage);
```

**Fix**: Populate `errorDetails_` with all ODBC error information
```cpp
// After:
// Populate errorDetails_ with all ODBC errors  
errorDetails_ = errors;
const std::string errorMessage = errors[0]->message;
SetError(errorMessage);
```

### 2. Create Proper JavaScript Error Objects

**File**: `cpp/src/js/workers/odbc_async_worker.cpp`

**Problem**: Creating plain JavaScript objects instead of Error objects
```cpp
// Before:
Napi::Object errorObj = Napi::Object::New(env);
errorObj.Set("message", error.Message());
// ... set properties on plain object
Callback().Call({errorObj, env.Null()});
```

**Fix**: Create actual JavaScript Error objects with ODBC properties
```cpp
// After:
Napi::Error jsError = Napi::Error::New(env, error.Message());
// Add ODBC-specific properties to the Error object
jsError.Set("sqlstate", Napi::String::New(env, firstError->sqlstate));
jsError.Set("code", Napi::Number::New(env, firstError->code));
jsError.Set("severity", Napi::Number::New(env, firstError->severity));
jsError.Set("serverName", Napi::String::New(env, firstError->serverName));
jsError.Set("procName", Napi::String::New(env, firstError->procName));
jsError.Set("lineNumber", Napi::Number::New(env, firstError->lineNumber));
// ... add details array
Callback().Call({jsError.Value(), env.Null()});
```

## Verification Results

### Test Case: `'query with errors'`
```javascript
// Original test expectation (now passing):
assert(e instanceof Error)                          // ✅ true
assert.strictEqual(e.sqlstate, '42000')            // ✅ "42000" 
assert.strictEqual(e.code, 105)                    // ✅ 105
assert.strictEqual(e.severity, 15)                 // ✅ 15
assert.strictEqual(e.procName, '')                 // ✅ ""
assert.strictEqual(e.lineNumber, 1)                // ✅ 1
assert(e.serverName.length > 0)                    // ✅ populated
```

### Error Object Structure
```javascript
{
  message: "[Microsoft][ODBC Driver 18 for SQL Server][SQL Server]Unclosed quotation mark...",
  sqlstate: "42000",
  code: 105,
  severity: 15, 
  serverName: "4353696fa8ed",
  procName: "",
  lineNumber: 1,
  details: [
    {
      sqlstate: "42000",
      message: "...",
      code: 105,
      severity: 15,
      serverName: "4353696fa8ed", 
      procName: "",
      lineNumber: 1
    }
  ]
}
```

## Impact

- **Backward Compatibility**: Restored compatibility with existing error handling code
- **API Consistency**: Error objects now match the original driver's behavior
- **Debugging**: Applications can now access ODBC-specific error details
- **Type Safety**: `instanceof Error` checks work correctly

## Files Modified

1. `cpp/src/js/workers/query_worker.cpp` - Capture full error details
2. `cpp/src/js/workers/odbc_async_worker.cpp` - Create proper Error objects

## Usage

JavaScript applications can now handle ODBC errors as expected:

```javascript
connection.queryRaw("INVALID SQL", (err, results) => {
  if (err) {
    console.log(err instanceof Error);        // true
    console.log('SQL State:', err.sqlstate);  // "42000"
    console.log('Error Code:', err.code);     // specific error number
    console.log('Severity:', err.severity);   // error severity level
    console.log('Server:', err.serverName);   // SQL Server instance
    console.log('Line:', err.lineNumber);     // line number in SQL
  }
});
```