# Implementation Notes for msnodesqlv8

## Interface-Based Architecture

This project follows an interface-based architecture to ensure testability and maintainability:

1. **IOdbcConnection**: Interface for database connections
2. **IOdbcStatement**: Interface for SQL statements with different types:
   - TransientStatement: For one-off query execution
   - PreparedStatement: For parameterized, reusable statements
   - TvpStatement: For table-valued parameters

## Statement Lifecycle

ODBC statements follow this lifecycle:
1. **Creation**: Statement is created by OdbcStatementFactory based on statement type
2. **Preparation** (for PreparedStatement): Statement is prepared for execution
3. **Execution**: Statement is executed with parameters
4. **Result Processing**: Result metadata is collected and returned
5. **Fetching**: Rows are fetched in batches
6. **Next Result Set**: Move to next result set if available
7. **Cleanup**: Statement is freed

## Mock Implementations for Testing

The project includes mock implementations for testing:
- MockIOdbcStatement: Implements the IOdbcStatement interface for testing
- MockOdbcApi: Implements the IOdbcApi interface for testing
- MockOdbcErrorHandler: Implements error handling for testing

Example usage:
```cpp
// Create a mock statement
auto mockStatement = std::make_shared<MockIOdbcStatement>();

// Configure the mock
EXPECT_CALL(*mockStatement, GetType())
    .WillRepeatedly(Return(StatementType::Prepared));
    
EXPECT_CALL(*mockStatement, Execute(_, _))
    .WillOnce(/* Define behavior */);
```

## Recent Changes

Recent changes include:
1. Implementation of FetchRows for retrieving results
2. Interface-based refactoring to improve testability
3. Added missing implementations for Promise-based APIs in TypeScript
4. Implemented PreparedStatement and TvpStatement classes

## Testing

The project includes both C++ and TypeScript tests:
- C++ tests use Google Test and Google Mock
- TypeScript tests use Mocha

Testing focuses on:
1. Unit tests for individual components
2. Integration tests for interaction between components
3. Mock tests to verify behavior with controlled dependencies

## Using the ODBC API Interface

All ODBC calls should be routed through the `IOdbcApi` interface rather than being called directly. This allows for proper mocking in tests and ensures consistent error handling and logging across the codebase.

Example of correct usage:

```cpp
// Instead of directly calling ODBC functions:
// auto ret = SQLGetData(statement, column, SQL_C_WCHAR, buffer, bufferSize, &resultSize);

// Use the interface:
auto ret = odbcApi_->SQLGetData(statement, column, SQL_C_WCHAR, buffer, bufferSize, &resultSize);
```

Benefits of using the interface:
1. Consistent logging of all ODBC calls
2. Centralized error handling
3. Support for mocking in tests
4. Better cross-platform compatibility
5. Easier maintenance when ODBC API changes

## Building

### Linux

1. Install required dependencies:
   ```bash
   sudo apt-get install -y unixodbc-dev g++ make
   ```

2. Build the module:
   ```bash
   npm install --build-from-source
   ```

### Windows

1. Install Visual Studio 2019 or later with C++ development tools.

2. Build the module:
   ```bash
   npm install --build-from-source
   ```