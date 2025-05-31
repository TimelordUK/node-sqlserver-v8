// Test script to verify SafeHandle functionality
const sql = require('../lib');

// Enable debug logging
sql.setLogLevel(4); // Debug level
sql.enableConsoleLogging(true);

async function testConnection() {
    console.log('Starting SafeHandle test...');

    const connectionString = 'Driver={ODBC Driver 18 for SQL Server};Server=127.0.0.1,1433;Database=node;UID=node_user;PWD=StrongPassword123!;TrustServerCertificate=yes;';

    try {
        console.log('Creating connection...');
        const conn = sql.createConnection();

        console.log('Opening connection...');
        await conn.promises.open(connectionString);
        console.log('Connection opened successfully');

        // Run a simple query
        console.log('Running query...');
        const result = await conn.promises.submit('SELECT 1 as test');
        console.log('Query result:', result);

        // Close the connection
        console.log('Closing connection...');
        await conn.promises.close();
        console.log('Connection closed successfully');

        // Test double-close protection
        console.log('Testing double-close protection...');
        try {
            await conn.promises.close();
            console.log('Double close succeeded (no error)');
        } catch (err) {
            console.log('Double close correctly prevented:', err.message);
        }

    } catch (err) {
        console.error('Error:', err);
    }
}

testConnection().then(() => {
    console.log('Test completed');
    process.exit(0);
}).catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
