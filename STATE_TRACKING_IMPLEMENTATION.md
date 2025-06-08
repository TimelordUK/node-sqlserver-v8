# Statement State Tracking Implementation

This implementation adds the ability to track ODBC statement state transitions from JavaScript, providing visibility into the C++ layer's statement lifecycle.

## Architecture Overview

### C++ Components

1. **IOdbcStateNotifier** (`cpp/include/odbc/odbc_state_notifier.h`)
   - Interface for receiving state change notifications
   - Thread-safe implementation using weak pointers

2. **OdbcStatement** modifications
   - Added `SetStateNotifier()` method to IOdbcStatement interface
   - Added `SetState()` protected method that triggers notifications
   - Stores weak reference to notifier to avoid circular dependencies

3. **OdbcStatementLegacy** modifications
   - Implemented `SetStateNotifier()` method
   - Modified `set_state()` to trigger notifications
   - Thread-safe implementation using mutex

4. **JsStateNotifier** (`cpp/include/js/js_state_notifier.h`)
   - Bridge between C++ and JavaScript
   - Uses NAPI ThreadSafeFunction for cross-thread callbacks
   - Converts state enums to strings for JavaScript

### JavaScript Components

1. **StreamEvents** modifications (`lib/notifier.js`)
   - Added `stateChangeCallback` property
   - Added `setStateChangeCallback()` method
   - Emits 'stateChange' events with detailed information

## State Transitions

The following states are tracked:

```
STATEMENT_CREATED (1)     - Initial state when statement is created
STATEMENT_PREPARED (2)    - Statement has been prepared
STATEMENT_SUBMITTED (3)   - Query submitted for execution
STATEMENT_READING (4)     - Reading results from server
STATEMENT_CANCEL_HANDLE (5) - Cancellation requested
STATEMENT_CANCELLED (6)   - Statement was cancelled
STATEMENT_ERROR (7)       - Error occurred
STATEMENT_CLOSED (8)      - Statement closed
STATEMENT_BINDING (9)     - Binding parameters
STATEMENT_POLLING (10)    - In polling mode
```

## Usage Example

```javascript
const queryStream = connection.queryRaw('SELECT * FROM table')

queryStream.on('stateChange', (stateInfo) => {
  console.log(`State changed from ${stateInfo.oldState} to ${stateInfo.newState}`)
  console.log(`Query ID: ${stateInfo.queryId}`)
  console.log(`Statement ID: ${stateInfo.statementId}`)
})
```

## Integration Points

To complete the integration, the following connection point needs to be implemented:

1. **Connection::Query** needs to:
   - Create a JsStateNotifier instance from the JavaScript callback
   - Pass it to the statement via SetStateNotifier()
   - This requires modifying the QueryWorker constructor to accept the notifier

2. **QueryOperationParams** may need to include:
   - Reference to the notifier callback function
   - This allows the C++ layer to set up state tracking

## Benefits

1. **Debugging** - Developers can see exactly what state a statement is in
2. **Performance Analysis** - Track time spent in each state
3. **Error Diagnosis** - Understand where failures occur in the lifecycle
4. **Monitoring** - Build dashboards showing statement execution patterns

## Thread Safety

- All state transitions are protected by mutexes
- Notifications use weak pointers to avoid lifetime issues
- JavaScript callbacks use ThreadSafeFunction for cross-thread safety

## Future Enhancements

1. Add timestamps to state transitions in C++
2. Include additional context (e.g., row counts, error details)
3. Add configuration to enable/disable state tracking
4. Persist state history for analysis