# Row Count JavaScript Integration Fix

## Problem

The row count field was missing from JavaScript query results even after fixing the C++ row count conversion issue. While the C++ side was correctly providing row count in metadata, it wasn't reaching the JavaScript layer.

## Root Cause Analysis

1. **C++ Side**: Fixed to provide `rowCount` in `fromNativeQueryResult()` method
2. **JavaScript Side**: The `rowCount` from C++ metadata wasn't being captured and passed through to `queryRaw` results

## Solution

### 1. Updated C++ Object Mapper (js_object_mapper.cpp)

Added missing `rowCount` field to the metadata object returned by `fromNativeQueryResult`:

```cpp
// In fromNativeQueryResult method (line 398):
metadata.Set("rowCount", Napi::Number::New(env, queryResult->get_row_count()));
```

### 2. Updated JavaScript Query Reader (lib/reader.js)

#### a) Capture row count from C++ metadata in `begin()` method:
```javascript
this.outputParams = res.outputParams
this.meta = res.queryResult.meta
this.rowCount = res.queryResult.rowCount || 0  // Added this line
this.notify.setHandle(res.queryResult.handle)
```

#### b) Initialize row count in constructor:
```javascript
this.rowCount = 0  // Added this line
```

#### c) Include row count in `metaRows()` result:
```javascript
metaRows () {
  return {
    meta: this.meta,
    rows: this.rows,
    rowCount: this.rowCount || 0  // Added this line
  }
}
```

#### d) Standardized row count field name in `rowsAffected()`:
```javascript
const state = {
  meta: null,
  rowCount: rowCount  // Changed from 'rowcount' to 'rowCount'
}
```

### 3. Updated Test Expectations (test/query.test.js)

Updated the "multiple results from query in callback" test to expect the new `rowCount` field:

```javascript
expected = {
  meta: [...],
  rows: [...],
  rowCount: 0  // Added this line
}
```

## Verification

### Test Results:
- **SELECT statements**: `rowCount: 0` (correct - row count unknown for SELECT)
- **INSERT statements**: `rowCount: 3` (correct - actual rows affected)  
- **DDL statements**: `rowCount: 0` (correct - no rows affected)

### Example Output:
```javascript
// SELECT query result
{
  "meta": [{ "name": "", "type": "text", ... }],
  "rows": [["test1"], ["test2"], ["test3"]],
  "rowCount": 0
}

// INSERT query result  
{
  "meta": null,
  "rowCount": 3
}
```

## Impact

- **Backward Compatibility**: Tests updated to expect new field, but functionality is additive
- **API Enhancement**: JavaScript applications can now access row count information
- **Consistency**: Row count behavior now matches across C++ and JavaScript layers
- **Standards Compliance**: Proper handling of ODBC row count semantics

## Files Modified

1. `cpp/src/js/js_object_mapper.cpp` - Added rowCount to metadata object
2. `lib/reader.js` - Captured and passed through row count from C++ to JavaScript
3. `test/query.test.js` - Updated test expectations to include rowCount field

## Usage

JavaScript applications can now access row count information in `queryRaw` results:

```javascript
connection.queryRaw("INSERT INTO table VALUES (1, 'test')", (err, result) => {
  console.log(`Affected rows: ${result.rowCount}`); // Will show actual count
});

connection.queryRaw("SELECT * FROM table", (err, result) => {
  console.log(`Row count: ${result.rowCount}`); // Will be 0 (unknown for SELECT)
  console.log(`Actual rows: ${result.rows.length}`); // Will show actual row count
});
```