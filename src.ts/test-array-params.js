const sql = require('../lib');

async function testArrayParams() {
    const connectionString = process.env.CONNECTION_STRING ||
        'Driver={ODBC Driver 18 for SQL Server};Server=localhost;Database=test;Trusted_Connection=Yes;Encrypt=optional;';

    console.log('Connecting to database...');
    const connection = await sql.open(connectionString);

    try {
        // Drop and create test table
        const tableName = 'test_array_bigint';
        await connection.promises.submitReadAll(`IF OBJECT_ID('${tableName}', 'U') IS NOT NULL DROP TABLE ${tableName}`);
        await connection.promises.submitReadAll(`CREATE TABLE ${tableName} (id int identity, bigint_test bigint)`);

        console.log('Table created. Now inserting array of values...');

        // Test array parameter - should insert 4 rows
        const testArray = [0x80, 0x8000, 0x800000, 0x80000000];
        console.log('Inserting array:', testArray);

        const insertResult = await connection.promises.submitReadAll(`INSERT INTO ${tableName} (bigint_test) VALUES (?)`, [[testArray]]);
        console.log('Insert complete. Result:', insertResult);

        // Query to verify
        const result = await connection.promises.submitReadAll(`SELECT bigint_test FROM ${tableName}`);
        console.log('Query results:');
        console.log('Row count:', result.resultSets[0].length);
        console.log('Values:', result.resultSets[0]);

        if (result.resultSets[0].length === 4) {
            console.log('SUCCESS: Array parameter binding worked correctly!');
        } else {
            console.log('FAILED: Expected 4 rows but got', result.resultSets[0].length);
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await connection.promises.close();
        console.log('Connection closed.');
    }
}

testArrayParams().catch(console.error);
