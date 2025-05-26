// Test file to verify TypeScript definitions work correctly
import * as sql from '../lib/sql'
import { Connection, Pool, Query, QueryMetaData } from '../lib/sql'

// Test 1: Basic connection and query
async function testBasicConnection() {
  const connectionString = 'Server=localhost;Database=test;Trusted_Connection=yes;'
  
  // Open connection
  const conn: Connection = await sql.promises.open(connectionString)
  
  // Query with callback
  conn.query('SELECT 1 as num', (err, rows) => {
    if (err) {
      console.error(err)
      return
    }
    console.log(rows)
  })
  
  // Query with promises
  const results = await conn.promises.query('SELECT 2 as num')
  console.log(results.results[0])
  
  // Close connection
  await conn.promises.close()
}

// Test 2: Prepared statements
async function testPreparedStatements() {
  const connectionString = 'Server=localhost;Database=test;Trusted_Connection=yes;'
  const conn = await sql.promises.open(connectionString)
  
  // Prepare statement
  const prepared = await conn.promises.prepare('SELECT * FROM users WHERE id = ?')
  
  // Execute prepared statement
  const results = await prepared.promises.query([1])
  console.log(results)
  
  // Free prepared statement
  await prepared.promises.free()
  await conn.promises.close()
}

// Test 3: Pool usage
async function testPool() {
  const pool = new sql.Pool({
    connectionString: 'Server=localhost;Database=test;Trusted_Connection=yes;',
    ceiling: 10,
    floor: 2
  })
  
  // Query through pool
  const results = await pool.query('SELECT 1 as num')
  console.log(results)
  
  // Get connection from pool
  const conn = await pool.open()
  await conn.promises.query('SELECT 2 as num')
  await conn.promises.close()
  
  // Close pool
  await pool.close()
}

// Test 4: User type conversions
function testUserTypes() {
  const intParam = sql.Int(42)
  const varcharParam = sql.VarChar('hello')
  const dateParam = sql.DateTime(new Date())
  const bitParam = sql.Bit(true)
  const decimalParam = sql.Decimal(123.45)
  
  console.log(intParam.name, intParam.val)
  console.log(varcharParam.name, varcharParam.val)
  console.log(dateParam.name, dateParam.val)
  console.log(bitParam.name, bitParam.val)
  console.log(decimalParam.name, decimalParam.val)
}

// Test 5: Bulk operations
async function testBulkOperations() {
  const conn = await sql.promises.open('Server=localhost;Database=test;Trusted_Connection=yes;')
  
  const table = await conn.promises.table('users')
  
  const rows = [
    { id: 1, name: 'John', age: 30 },
    { id: 2, name: 'Jane', age: 25 },
    { id: 3, name: 'Bob', age: 35 }
  ]
  
  await table.promises.insertRows(rows)
  await table.promises.updateRows(rows)
  await table.promises.deleteRows(rows)
  
  await conn.promises.close()
}

// Test 6: Event-based query
function testEventBasedQuery() {
  sql.open('Server=localhost;Database=test;Trusted_Connection=yes;', (err, conn) => {
    if (err) {
      console.error(err)
      return
    }
    
    const query: Query = conn.query('SELECT * FROM large_table')
    
    query.on('meta', (meta: QueryMetaData[]) => {
      console.log('Columns:', meta.map(m => m.name))
    })
    
    query.on('row', (rowIndex: number) => {
      console.log('Row:', rowIndex)
    })
    
    query.on('column', (colIndex: number, data: any, more: boolean) => {
      console.log('Column:', colIndex, data, more)
    })
    
    query.on('done', () => {
      console.log('Query complete')
      conn.close()
    })
    
    query.on('error', (err: Error) => {
      console.error('Query error:', err)
      conn.close()
    })
  })
}

// Test 7: Stored procedures
async function testStoredProcedures() {
  const conn = await sql.promises.open('Server=localhost;Database=test;Trusted_Connection=yes;')
  
  // Call procedure with positional parameters
  const result1 = await conn.promises.callProc('sp_GetUser', [1])
  console.log(result1)
  
  // Call procedure with named parameters
  const result2 = await conn.promises.callProc('sp_UpdateUser', { userId: 1, name: 'John Updated' })
  console.log(result2)
  
  await conn.promises.close()
}

// Test 8: Transaction handling
async function testTransactions() {
  const conn = await sql.promises.open('Server=localhost;Database=test;Trusted_Connection=yes;')
  
  try {
    await conn.promises.beginTransaction()
    
    await conn.promises.query('INSERT INTO users (name) VALUES (?)', ['New User'])
    await conn.promises.query('UPDATE users SET active = 1 WHERE name = ?', ['New User'])
    
    await conn.promises.commit()
  } catch (err) {
    await conn.promises.rollback()
    console.error('Transaction failed:', err)
  } finally {
    await conn.promises.close()
  }
}

// Export functions for testing
export {
  testBasicConnection,
  testPreparedStatements,
  testPool,
  testUserTypes,
  testBulkOperations,
  testEventBasedQuery,
  testStoredProcedures,
  testTransactions
}