import * as sql from 'msnodesqlv8'
import { QueryAggregatorResults } from 'msnodesqlv8/types'

// Configure logging for development - shows DEBUG messages in console
sql.logger.configureForDevelopment()

// Alternative configurations:
// sql.logger.configureForProduction('/var/log/myapp')  // INFO level, file only
// sql.logger.configureForInfoConsole()                 // INFO level, console only
// sql.logger.configureForTesting('/tmp/test.log')      // TRACE level, console + file

// For custom configuration:
// sql.logger.setLogLevel(sql.LogLevel.DEBUG)
// sql.logger.setConsoleLogging(true)
// sql.logger.setLogFile('./sql-debug.log')

// Replace with your connection string
const connectionString = 'Driver={ODBC Driver 18 for SQL Server};Server=127.0.0.1,1433;Database=node;UID=node_user;PWD=StrongPassword123!;TrustServerCertificate=yes;;Connect Timeout=10'

async function main(): Promise<void> {
  let connection

  try {
    // The logger will automatically log connection attempts
    connection = await sql.promises.open(connectionString)
    
    // Simple query
    const result: QueryAggregatorResults = await connection.promises.query(
      'SELECT name, create_date FROM sys.tables WHERE type = ?',
      ['U']  // 'U' for user tables
    )
    
    console.log(`Found ${result.rows} tables`)
    console.log('First few tables:', result.first?.slice(0, 3))
    
    // Stored procedure call (if you have one)
    // const procResult = await connection.promises.callProc('sp_who')
    // console.log('Active connections:', procResult.first?.length)
    
  } catch (error) {
    // Errors are automatically logged at ERROR level
    console.error('Database operation failed:', error)
  } finally {
    if (connection) {
      await connection.promises.close()
    }
  }
}

// Using connection pool with logging
async function poolExample(): Promise<void> {
  const pool = new sql.Pool({
    connectionString,
    floor: 2,
    ceiling: 4
  })

  try {
    await pool.promises.open()
    
    // Execute multiple queries - the pool and logger will show which connection handles each
    const results = await Promise.all([
      pool.promises.query('SELECT 1 as num'),
      pool.promises.query('SELECT 2 as num'),
      pool.promises.query('SELECT 3 as num')
    ])
    
    console.log('Pool query results:', results.map(r => r.first?.[0]))
    
  } finally {
    await pool.promises.close()
  }
}

// Run examples
(async () => {
  console.log('=== Single Connection Example ===')
  await main()
  
  console.log('\n=== Connection Pool Example ===')
  await poolExample()
  
  // Get final logger stats
  const config = sql.logger.getConfiguration()
  console.log('\nLogger configuration:', config)
})()