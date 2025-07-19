import * as sql from 'msnodesqlv8'
import { QueryAggregatorResults } from 'msnodesqlv8/types'

// Example 1: Enable trace logging for debugging
// This will show all JavaScript and C++ debug messages
sql.logger.setLogLevel(sql.LogLevel.TRACE)
sql.logger.setConsoleLogging(true)

// Example 2: Enable logging to a file
// sql.logger.setLogFile('/var/log/myapp/sql-trace.log')

// Example 3: Use pre-configured settings
// sql.logger.configureForDevelopment()  // DEBUG level, console enabled
// sql.logger.configureForProduction('/var/log/myapp')  // INFO level, file only
// sql.logger.configureForTesting()  // TRACE level

// Example 4: Configure for info console only
// sql.logger.configureForInfoConsole()

// Example 5: Disable all logging (default for production)
// sql.logger.setLogLevel(sql.LogLevel.SILENT)

// Get current configuration
const config = sql.logger.getConfiguration()
console.log('Current logger configuration:', config)

// Example connection string - replace with your own
const connectionString = 'Driver={ODBC Driver 18 for SQL Server};Server=127.0.0.1,1433;Database=node;UID=node_user;PWD=StrongPassword123!;TrustServerCertificate=yes;;Connect Timeout=10'

async function demonstrateLogging(): Promise<void> {
  try {
    // Log custom messages at different levels
    sql.logger.trace('Starting promise-based SQL operations', 'demonstrateLogging')
    sql.logger.debug('Connection string configured', 'demonstrateLogging')
    
    // Open connection using promises
    sql.logger.info('Opening database connection...', 'demonstrateLogging')
    const connection = await sql.promises.open(connectionString)
    sql.logger.info('Connection opened successfully', 'demonstrateLogging')
    
    // Execute a simple query
    sql.logger.debug('Executing test query', 'demonstrateLogging')
    const results: QueryAggregatorResults = await connection.promises.query('SELECT 1 as test, GETDATE() as currentTime')
    
    sql.logger.info(`Query completed in ${results.elapsed}ms`, 'demonstrateLogging')
    sql.logger.debug(`Results: ${JSON.stringify(results.first)}`, 'demonstrateLogging')
    
    // Demonstrate lazy logging for expensive operations
    sql.logger.traceLazy(() => {
      // This function is only called if TRACE level is enabled
      return `Detailed results: ${JSON.stringify(results, null, 2)}`
    }, 'demonstrateLogging')
    
    // Execute multiple queries using pool
    sql.logger.info('Creating connection pool...', 'demonstrateLogging')
    const pool = new sql.Pool({
      connectionString,
      floor: 2,
      ceiling: 4,
      heartbeatSecs: 20,
      heartbeatSql: 'SELECT @@SPID as spid',
      inactivityTimeoutSecs: 60
    })
    
    await pool.promises.open()
    sql.logger.info('Pool opened successfully', 'demonstrateLogging')
    
    // Execute queries in parallel
    sql.logger.debug('Executing parallel queries', 'demonstrateLogging')
    const parallelQueries = Promise.all([
      pool.promises.query('SELECT 1 as query1'),
      pool.promises.query('SELECT 2 as query2'),
      pool.promises.query('SELECT 3 as query3')
    ])
    
    const parallelResults = await parallelQueries
    sql.logger.info(`Completed ${parallelResults.length} parallel queries`, 'demonstrateLogging')
    
    // Clean up
    sql.logger.debug('Closing pool', 'demonstrateLogging')
    await pool.promises.close()
    
    sql.logger.debug('Closing connection', 'demonstrateLogging')
    await connection.promises.close()
    
    sql.logger.info('All operations completed successfully', 'demonstrateLogging')
    
  } catch (error) {
    sql.logger.error(`Operation failed: ${error}`, 'demonstrateLogging')
    throw error
  } finally {
    // Optionally close the logger to flush any pending file writes
    sql.logger.close()
  }
}

// Run the demonstration
demonstrateLogging()
  .then(() => {
    console.log('Logging demonstration completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Logging demonstration failed:', error)
    process.exit(1)
  })