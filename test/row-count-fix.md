# Row Count Management Fix

## Problem

The row count was being reported as `18446744073709551615` (UINT64_MAX) in query results, which is incorrect and caused by improper type conversion.

## Root Cause

1. **ODBC Behavior**: `SQLRowCount()` returns `-1` for SELECT statements where the row count is unknown or not applicable
2. **Type Mismatch**: The code was converting from `SQLLEN` (signed) to `size_t` (unsigned) without proper bounds checking
3. **Improper Conversion**: When `-1` (signed) is cast to `size_t` (unsigned), it becomes `18446744073709551615`

## Solution

Modified the row count conversion in `odbc_statement_legacy.cpp` at two locations:

### 1. `TryReadRows()` method (line 119-120)
```cpp
// Before:
result->set_row_count(this->_resultset->row_count());

// After:
auto raw_row_count = this->_resultset->row_count();
result->set_row_count(raw_row_count >= 0 ? static_cast<size_t>(raw_row_count) : 0);
```

### 2. `ReadNextResult()` method (line 138-139)
```cpp
// Before:
result->set_row_count(this->_resultset->row_count());

// After:
auto raw_row_count = this->_resultset->row_count();
result->set_row_count(raw_row_count >= 0 ? static_cast<size_t>(raw_row_count) : 0);
```

## Fix Logic

- **If `SQLLEN >= 0`**: Convert to `size_t` normally (valid row count)
- **If `SQLLEN < 0`**: Set to `0` instead of allowing negative-to-unsigned conversion

## Verification

- All pause tests continue to pass (12/12)
- Row count is now correctly reported as `0` for SELECT statements where count is unknown
- No more appearance of the huge unsigned number `18446744073709551615`

## Impact

- **Safe**: The fix only affects invalid negative row counts, preserving valid positive counts
- **Backward Compatible**: Applications expecting `-1` to become a huge number were likely buggy anyway
- **Correct**: Row count of `0` for unknown counts is more meaningful than a huge number

## Files Modified

- `cpp/src/odbc/odbc_statement_legacy.cpp` - Added bounds checking for row count conversion