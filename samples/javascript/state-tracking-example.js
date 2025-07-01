/**
 * Example demonstrating statement state tracking in msnodesqlv8
 * 
 * This example shows how to subscribe to state change events
 * to monitor the execution lifecycle of SQL statements.
 */

const sql = require('msnodesqlv8')

// Configure logging for development
sql.logger.setLogLevel(sql.LogLevel.TRACE)
sql.logger.setConsoleLogging(true)

// Or configure manually:
// sql.logger.setLogLevel(sql.LogLevel.TRACE)  // Set to TRACE for maximum verbosity
// sql.logger.setConsoleLogging(true)          // Enable console output
// sql.logger.setLogFile('/tmp/msnodesqlv8.log') // Enable file logging

// Log current configuration
console.log('Logger configuration:', sql.logger.getConfiguration())

// Example of using the logger in your code
sql.logger.info('Starting SQL Server connection test')

const { TestEnv } = require('../../test/env/test-env')
const env = new TestEnv()
const connectionString = env.connectionString

async function trackStatementStates() {
  console.log('Opening connection...')
  const connection = await sql.promises.open(connectionString)
  
  try {
    // Simple query to demonstrate state tracking
    const query = `
      SELECT TOP 10 
        name, 
        object_id, 
        type_desc 
      FROM sys.objects 
      WHERE type = 'U'
    `
    
    console.log('\nExecuting query with state tracking...')
    const queryStream = connection.queryRaw(query)
    
    // Subscribe to state change events
    queryStream.on('stateChange', (stateInfo) => {
      console.log('State change:', JSON.stringify(stateInfo, null, 2))
    })
    
    // Track other query events
    queryStream.on('meta', (meta) => {
      console.log(`[Meta] Received ${meta.length} columns`)
    })
    
    queryStream.on('row', (rowIndex) => {
      console.log(`[Row] Received row ${rowIndex}`)
    })
    
    queryStream.on('column', (columnIndex, data) => {
      // Don't log every column to avoid clutter
    })
    
    queryStream.on('done', () => {
      console.log('[Done] Query completed')
    })
    
    queryStream.on('error', (err) => {
      console.error('[Error]', err)
    })
    
    // Wait for query to complete
    await new Promise((resolve, reject) => {
      queryStream.on('free', resolve)
      queryStream.on('error', reject)
    })
    
    // Example with prepared statement to see different state transitions
    console.log('\n--- Prepared Statement Example ---')
    const ps = await connection.promises.prepare('SELECT @id as id, @name as name')
    
    // Track state changes on prepared statement execution
    const preparedStream = ps.queryRaw([{ id: 1, name: 'Test' }])
    
    preparedStream.on('stateChange', (stateInfo) => {
      console.log(`[Prepared State] ${stateInfo.oldState} -> ${stateInfo.newState}`)
    })
    
    await new Promise((resolve) => {
      preparedStream.on('free', resolve)
    })
    
    await ps.promises.free()
    
  } finally {
    await connection.promises.close()
    console.log('\nConnection closed.')
  }
}

// Run the example
trackStatementStates().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})

/**
 * Expected state transitions:
 * 
 * 1. STATEMENT_CREATED - Statement handle allocated
 * 2. STATEMENT_PREPARED - Statement prepared (for prepared statements)
 * 3. STATEMENT_BINDING - Parameters being bound
 * 4. STATEMENT_SUBMITTED - Query submitted to server
 * 5. STATEMENT_READING - Reading results from server
 * 6. STATEMENT_POLLING - In polling mode (if enabled)
 * 7. STATEMENT_CLOSED - Statement closed and resources released
 * 
 * Error states:
 * - STATEMENT_ERROR - Error occurred
 * - STATEMENT_CANCELLED - Statement was cancelled
 * - STATEMENT_CANCEL_HANDLE - Cancellation in progress
 */