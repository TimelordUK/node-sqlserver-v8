# Mock Implementation for ODBC Module Testing

This directory contains mock implementations of various interfaces used in the ODBC driver.

## MockIOdbcStatement

The `MockIOdbcStatement` class is a complete mock implementation of the `IOdbcStatement` interface, which allows for more flexible testing of components that depend on ODBC statements.

### Features

- Implements the entire `IOdbcStatement` interface
- Provides default behaviors through ON_CALL setup
- Includes a `ConfigureForSuccessfulQuery` helper method to quickly set up common test scenarios
- Can be used to test error conditions and normal operation flows

### Example Usage

```cpp
// Create a mock statement
auto mockStatement = std::make_shared<MockIOdbcStatement>();

// Set up basic expectations
EXPECT_CALL(*mockStatement, GetType())
    .WillOnce(Return(StatementType::Prepared));

EXPECT_CALL(*mockStatement, Execute(_, _))
    .WillOnce(Return(true));

// Use ConfigureForSuccessfulQuery for more complex scenarios with column definitions
std::vector<ColumnDefinition> columns;
columns.push_back(CreateTestColumn("id", SQL_INTEGER));
columns.push_back(CreateTestColumn("name", SQL_VARCHAR));
mockStatement->ConfigureForSuccessfulQuery(columns, 10);

// Now use the mock with the object under test
auto result = std::make_shared<QueryResult>();
bool success = mockStatement->Execute({}, result);
// Assertions...
```

### Testing Error Conditions

```cpp
// Create a mock statement
auto mockStatement = std::make_shared<MockIOdbcStatement>();

// Configure for error scenarios
EXPECT_CALL(*mockStatement, Execute(_, _))
    .WillOnce(Return(false));

EXPECT_CALL(*mockStatement, GetState())
    .WillRepeatedly(Return(StatementState::STMT_ERROR));

// Now use the mock to test error handling in your code
auto result = std::make_shared<QueryResult>();
bool success = mockStatement->Execute({}, result);
// Assertions for error handling...
```

## Integration with OdbcConnection and Other Components

The interface-based approach allows for easy mocking of statements when testing:

- OdbcConnection
- Query execution
- Transaction management
- Error handling
- Statement caching

This supports a more isolated testing approach where you can focus on the behavior of specific components without requiring a real database connection.

## Creating Custom Mock Behaviors

You can create custom behavior for specific test scenarios:

```cpp
// Create a custom row fetching behavior
EXPECT_CALL(*mockStatement, TryReadRows(_, _))
    .WillRepeatedly(DoAll(
        Invoke([](std::shared_ptr<QueryResult> result, size_t rowCount) {
            // Custom row data population logic here
            result->set_end_of_rows(rowCount > 5); // End after 5 rows
            return true;
        }),
        Return(true)));
```

## Extending the Mock

The mock implementation can be extended with additional helper methods for common testing patterns as needed.