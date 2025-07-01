'use strict'

const sql = require('../../lib/sql')

// Example 1: Enable trace logging for debugging
// This will show all JavaScript and C++ debug messages
sql.logger.setLogLevel(sql.LogLevel.TRACE)
sql.logger.setConsoleLogging(true)

// Example 2: Enable logging to a file
// sql.logger.setLogFile('/var/log/myapp/sql-trace.log')

// Example 3: Use pre-configured settings
// sql.logger.configureForDevelopment()  // TRACE level, console enabled
// sql.logger.configureForProduction('/var/log/myapp')  // ERROR level, file only
// sql.logger.configureForTesting()  // SILENT level

// Example 4: Disable all logging (default for production)
// sql.logger.setLogLevel(sql.LogLevel.SILENT)

// Now all SQL operations will use the configured logging

const { TestEnv } = require('../../test/env/test-env')
const env = new TestEnv()
const connectionString = env.connectionString

sql.open(connectionString, (err, conn) => {
  if (err) {
    console.error('Connection failed:', err)
    return
  }
  
  conn.query('SELECT 1 as test', (err, results) => {
    if (err) {
      console.error('Query failed:', err)
    } else {
      console.log('Query succeeded:', results)
    }
    conn.close()
  })
})