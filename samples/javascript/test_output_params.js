const sql = require('.');

async function test() {
  try {
    const connStr = 'Driver={ODBC Driver 17 for SQL Server};Server=127.0.0.1,1433;Database=node;UID=node_user;PWD=StrongPassword123!;TrustServerCertificate=yes;';
    
    // First create the stored procedure
    const conn = await sql.promises.open(connStr);
    
    try {
      await conn.promises.query(`DROP PROCEDURE test_sp_get_str_str`);
    } catch (e) {
      // Ignore if doesn't exist
    }
    
    await conn.promises.query(`
      CREATE PROCEDURE test_sp_get_str_str(
        @id INT,
        @name varchar(20) OUTPUT,
        @company varchar(20) OUTPUT
      ) AS
      BEGIN
        SET @name = 'name'
        SET @company = 'company'
        RETURN 99;
      END
    `);
    
    // Call the procedure
    const result = await conn.promises.callProc('test_sp_get_str_str', [1]);
    
    console.log('Result:', result);
    console.log('Output:', result.output);
    console.log('Output JSON:', JSON.stringify(result.output));
    
    // Check result
    const expected = [99, 'name', 'company'];
    console.log('Expected:', expected);
    console.log('Match:', JSON.stringify(result.output) === JSON.stringify(expected));
    
    await conn.promises.close();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

test();