// Test script to verify complete query lifecycle with cleanup
const sql = require('../lib');

// Enable debug logging
sql.setLogLevel(4); // Debug level
sql.enableConsoleLogging(true);

// Test compound query lifecycle
async function testCompoundQuery() {
  console.log('Starting compound query lifecycle test...');

  const connectionString = 'Driver={ODBC Driver 18 for SQL Server};Server=127.0.0.1,1433;Database=node;UID=node_user;PWD=StrongPassword123!;TrustServerCertificate=yes;';

  const conn = sql.createConnection();

  try {
    console.log('Opening connection...');
    await conn.promises.open(connectionString);
    console.log('Connection opened successfully');

    // Create a compound query
    const compoundQuery = `
      SELECT 1 as test, 'first' as name;
      SELECT 2 as test, 'second' as name;
      SELECT 3 as test, 'third' as name;
    `;

    console.log('Executing compound query...');
    const initialResult = await conn.promises.submit(compoundQuery);

    // Create QueryAggregator - needs to be imported properly
    const { QueryAggregator } = require('../lib/query-aggregator');
    const aggregator = new QueryAggregator(conn, initialResult);

    // Listen for events
    aggregator.on('resultSet', (data) => {
      console.log(`Processed result set ${data.index}: ${data.rowCount} rows`);
    });

    aggregator.on('statementComplete', (handle) => {
      console.log(`Statement ${handle.statementId} cleanup complete`);
    });

    // Get all results
    const results = await aggregator.getResults();

    console.log('Aggregated results:');
    console.log(`- Total result sets: ${results.totalResultSets}`);
    console.log(`- Total rows: ${results.totalRows}`);

    results.resultSets.forEach((rs, index) => {
      console.log(`Result set ${index}:`, rs.rows);
    });

    console.log('All queries processed and cleaned up');

    // Try to use the statement after cleanup (should fail gracefully)
    console.log('Testing post-cleanup safety...');
    try {
      await conn.promises.fetchRows(initialResult.handle, 10);
      console.error('ERROR: Should not be able to fetch rows after cleanup!');
    } catch (error) {
      console.log('✓ Correctly prevented access to cleaned up statement:', error.message);
    }

    // Close connection
    console.log('Closing connection...');
    await conn.promises.close();
    console.log('Connection closed successfully');

  } catch (err) {
    console.error('Error:', err);
  }
}

// Test simple query lifecycle
async function testSimpleQuery() {
  console.log('\nStarting simple query lifecycle test...');

  const connectionString = 'Driver={ODBC Driver 18 for SQL Server};Server=127.0.0.1,1433;Database=node;UID=node_user;PWD=StrongPassword123!;TrustServerCertificate=yes;';

  const conn = sql.createConnection();

  try {
    await conn.promises.open(connectionString);

    // Run a simple query
    const result = await conn.promises.submit('SELECT 1 as test');
    console.log('Query result:', result);

    // Manually release the statement
    console.log('Releasing statement...');
    await conn.promises.releaseStatement(result.handle);
    console.log('Statement released');

    // Try to use after release
    try {
      await conn.promises.fetchRows(result.handle, 10);
      console.error('ERROR: Should not be able to use released statement!');
    } catch (error) {
      console.log('✓ Correctly prevented access to released statement:', error.message);
    }

    await conn.promises.close();

  } catch (err) {
    console.error('Error:', err);
  }
}

// Run tests
async function runTests() {
  await testSimpleQuery();
  await testCompoundQuery();
  console.log('\nAll tests completed');
}

runTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
