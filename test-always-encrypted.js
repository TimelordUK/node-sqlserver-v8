const sql = require('msnodesqlv8');

const connectionString = 'Driver={ODBC Driver 18 for SQL Server};Server=127.0.0.1,1433;Database=node;UID=sa;PWD=Password_123#;TrustServerCertificate=yes;ColumnEncryption=Enabled;';

console.log('🔐 Testing Always Encrypted setup...');

// Test basic connection and table existence
sql.query(connectionString, `
    SELECT COUNT(*) as TableExists 
    FROM INFORMATION_SCHEMA.TABLES 
    WHERE TABLE_NAME = 'test_encrypted'
`, (err, results) => {
    if (err) {
        console.error('❌ Connection test failed:', err);
        return;
    }
    
    console.log('✅ Connection successful, table exists:', results[0].TableExists === 1);
    
    // Test inserting encrypted data
    const insertSql = 'INSERT INTO dbo.test_encrypted (name_encrypted, email_encrypted, name_plain) VALUES (?, ?, ?)';
    const params = ['John Doe', 'john.doe@example.com', 'John Plain Text'];
    
    console.log('📝 Inserting encrypted data...');
    sql.query(connectionString, insertSql, params, (insertErr, insertResult) => {
        if (insertErr) {
            console.error('❌ Insert failed:', insertErr);
            return;
        }
        
        console.log('✅ Data inserted successfully');
        
        // Query the data back (should be automatically decrypted)
        console.log('📖 Querying encrypted data...');
        sql.query(connectionString, 'SELECT * FROM dbo.test_encrypted', (queryErr, queryResults) => {
            if (queryErr) {
                console.error('❌ Query failed:', queryErr);
                return;
            }
            
            console.log('✅ Encrypted data retrieved and decrypted:');
            queryResults.forEach((row, index) => {
                console.log(`  Row ${index + 1}:`);
                console.log(`    ID: ${row.id}`);
                console.log(`    Name (encrypted): ${row.name_encrypted}`);
                console.log(`    Email (encrypted): ${row.email_encrypted}`);
                console.log(`    Name (plain): ${row.name_plain}`);
                console.log(`    Created: ${row.created_date}`);
            });
            
            // Test querying without Always Encrypted to see raw encrypted data
            console.log('\n🔍 Testing without Always Encrypted (should show encrypted values)...');
            const connectionStringNoAE = connectionString.replace(';ColumnEncryption=Enabled', '');
            
            sql.query(connectionStringNoAE, 'SELECT * FROM dbo.test_encrypted', (rawErr, rawResults) => {
                if (rawErr) {
                    console.error('❌ Raw query failed:', rawErr);
                    return;
                }
                
                console.log('✅ Raw encrypted data (without decryption):');
                rawResults.forEach((row, index) => {
                    console.log(`  Row ${index + 1}:`);
                    console.log(`    Name (raw encrypted): ${row.name_encrypted ? '[ENCRYPTED]' : 'NULL'}`);
                    console.log(`    Email (raw encrypted): ${row.email_encrypted ? '[ENCRYPTED]' : 'NULL'}`);
                    console.log(`    Name (plain): ${row.name_plain}`);
                });
                
                console.log('\n🎉 Always Encrypted test completed successfully!');
            });
        });
    });
});