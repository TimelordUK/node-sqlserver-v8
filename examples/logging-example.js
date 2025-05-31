'use strict'

const sql = require('../lib/sql')

// Configure logging for development
sql.logger.configureForDevelopment()

// Or configure manually:
// sql.logger.setLogLevel(sql.LogLevel.TRACE)  // Set to TRACE for maximum verbosity
// sql.logger.setConsoleLogging(true)          // Enable console output
// sql.logger.setLogFile('/tmp/msnodesqlv8.log') // Enable file logging

// Log current configuration
console.log('Logger configuration:', sql.logger.getConfiguration())

// Example of using the logger in your code
sql.logger.info('Starting SQL Server connection test')

// The logger will now capture both JavaScript and C++ level logs
const connectionString = 'Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=master;Trusted_Connection=yes;'

sql.open(connectionString, (err, conn) => {
  if (err) {
    sql.logger.error(`Failed to connect: ${err.message}`)
    return
  }

  sql.logger.info('Successfully connected to SQL Server')
  
  // Run a simple query
  conn.query('SELECT @@VERSION as version', (err, results) => {
    if (err) {
      sql.logger.error(`Query failed: ${err.message}`)
    } else {
      sql.logger.debug(`Query results: ${JSON.stringify(results)}`)
    }
    
    // Close connection
    conn.close(() => {
      sql.logger.info('Connection closed')
    })
  })
})

// Example of different log levels
sql.logger.error('This is an error message')
sql.logger.warning('This is a warning message')
sql.logger.info('This is an info message')
sql.logger.debug('This is a debug message')
sql.logger.trace('This is a trace message')

// You can also add context to your logs
sql.logger.info('Processing user request', 'UserController')
sql.logger.debug('Query parameters validated', 'QueryValidator')