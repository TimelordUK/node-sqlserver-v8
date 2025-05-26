// JavaScript test file with JSDoc type annotations
// This demonstrates how JS files can benefit from TypeScript definitions

'use strict'

/**
 * @typedef {import('../lib/sql').Connection} Connection
 * @typedef {import('../lib/sql').Query} Query
 * @typedef {import('../lib/sql').QueryMetaData} QueryMetaData
 * @typedef {import('../lib/sql').Pool} Pool
 * @typedef {import('../lib/sql').QueryCb} QueryCb
 * @typedef {import('../lib/sql').ConcreteColumnType} ConcreteColumnType
 */

const sql = require('../lib/sql')

/**
 * Test basic connection with type safety in JS
 * @returns {Promise<void>}
 */
async function testBasicConnectionJS() {
  const connectionString = 'Server=localhost;Database=test;Trusted_Connection=yes;'
  
  /** @type {Connection} */
  const conn = await sql.promises.open(connectionString)
  
  // IDE should now provide autocomplete for conn methods
  const results = await conn.promises.query('SELECT 1 as num')
  console.log(results.results[0])
  
  await conn.promises.close()
}

/**
 * Test callback-style queries with proper typing
 * @param {string} connectionString
 * @returns {Promise<void>}
 */
function testCallbackQueries(connectionString) {
  return new Promise((resolve, reject) => {
    sql.open(connectionString, 
      /**
       * @param {Error | undefined} err
       * @param {Connection} conn
       */
      (err, conn) => {
        if (err) {
          reject(err)
          return
        }
        
        // Query with typed callback
        conn.query('SELECT * FROM users', 
          /** @type {QueryCb} */
          (err, rows, more) => {
            if (err) {
              conn.close(() => reject(err))
              return
            }
            
            console.log('Rows:', rows)
            console.log('More results:', more)
            
            conn.close(() => resolve())
          })
      })
  })
}

/**
 * Test event-based queries with proper event typing
 * @param {Connection} conn
 * @returns {Query}
 */
function testEventQuery(conn) {
  const query = conn.query('SELECT * FROM large_table')
  
  query.on('meta', 
    /** @param {QueryMetaData[]} meta */
    (meta) => {
      console.log('Column names:', meta.map(m => m.name))
      console.log('Column types:', meta.map(m => m.type))
    })
  
  query.on('row', 
    /** @param {number} rowIndex */
    (rowIndex) => {
      console.log('Processing row:', rowIndex)
    })
  
  query.on('column',
    /**
     * @param {number} colIndex
     * @param {any} data
     * @param {boolean} more
     */
    (colIndex, data, more) => {
      console.log(`Column ${colIndex}:`, data, 'Has more:', more)
    })
  
  query.on('error',
    /** @param {Error} err */
    (err) => {
      console.error('Query error:', err.message)
    })
  
  query.on('done', () => {
    console.log('Query completed')
  })
  
  return query
}

/**
 * Test pool with proper typing
 * @returns {Promise<void>}
 */
async function testPoolJS() {
  /** @type {Pool} */
  const pool = new sql.Pool({
    connectionString: 'Server=localhost;Database=test;Trusted_Connection=yes;',
    ceiling: 10,
    floor: 2,
    heartbeatSecs: 30,
    inactivityTimeoutSecs: 300
  })
  
  // Pool events with proper typing
  pool.on('status', 
    /** @param {import('../lib/sql').PoolStatusRecord} status */
    (status) => {
      console.log('Pool status:', {
        busy: status.busy,
        idle: status.idle,
        parked: status.parked,
        paused: status.paused
      })
    })
  
  // Query through pool
  const results = await pool.query('SELECT COUNT(*) as count FROM users')
  console.log('User count:', results[0].count)
  
  await pool.close()
}

/**
 * Test user type conversions with proper typing
 * @param {Connection} conn
 * @returns {Promise<void>}
 */
async function testUserTypesJS(conn) {
  /** @type {ConcreteColumnType[]} */
  const params = [
    sql.Int(42),
    sql.VarChar('Hello World'),
    sql.DateTime(new Date()),
    sql.Bit(true),
    sql.Decimal(123.45),
    sql.UniqueIdentifier('6F9619FF-8B86-D011-B42D-00C04FC964FF')
  ]
  
  // Use typed parameters in query
  const query = 'INSERT INTO test_table (int_col, varchar_col, date_col, bit_col, decimal_col, guid_col) VALUES (?, ?, ?, ?, ?, ?)'
  await conn.promises.query(query, params)
}

/**
 * Test bulk operations with proper typing
 * @param {Connection} conn
 * @returns {Promise<void>}
 */
async function testBulkOperationsJS(conn) {
  /** @type {import('../lib/sql').BulkTableMgr} */
  const bulkMgr = await conn.promises.table('users')
  
  /** @type {Array<{id: number, name: string, email: string}>} */
  const rows = [
    { id: 1, name: 'John Doe', email: 'john@example.com' },
    { id: 2, name: 'Jane Smith', email: 'jane@example.com' },
    { id: 3, name: 'Bob Johnson', email: 'bob@example.com' }
  ]
  
  // Bulk insert with progress tracking
  await bulkMgr.promises.insertRows(rows)
  
  // Get bulk operation summary
  const summary = bulkMgr.getSummary()
  console.log('Insert signature:', summary.insertSignature)
  console.log('Primary columns:', summary.primaryColumns.map(c => c.name))
}

/**
 * Test stored procedure calls
 * @param {Connection} conn
 * @returns {Promise<void>}
 */
async function testStoredProceduresJS(conn) {
  // Get procedure definition
  /** @type {import('../lib/sql').ProcedureDefinition} */
  const proc = await conn.promises.getProc('sp_GetUserById')
  
  // Call with typed parameters
  const result = await proc.promises.call({
    userId: sql.Int(1),
    includeInactive: sql.Bit(false)
  })
  
  console.log('Procedure results:', result.results)
  console.log('Output parameters:', result.output)
}

// Export functions for use
module.exports = {
  testBasicConnectionJS,
  testCallbackQueries,
  testEventQuery,
  testPoolJS,
  testUserTypesJS,
  testBulkOperationsJS,
  testStoredProceduresJS
}