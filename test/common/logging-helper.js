'use strict'

/**
 * Test Logging Helper
 * 
 * Controls logging behavior for tests based on environment variables:
 * 
 * Environment Variables:
 * - MSNODESQLV8_TEST_LOG_LEVEL: Set log level (SILENT, ERROR, WARNING, INFO, DEBUG, TRACE)
 *   Default: SILENT (no logging unless explicitly enabled)
 * 
 * - MSNODESQLV8_TEST_LOG_CONSOLE: Enable console logging (true/false)
 *   Default: false
 * 
 * - MSNODESQLV8_TEST_LOG_FILE: Path to log file
 *   Default: none (no file logging)
 * 
 * - MSNODESQLV8_TEST_VERBOSE: Shortcut to enable TRACE logging to console
 *   Default: false
 * 
 * Example usage:
 *   # Run tests silently (default)
 *   npm test
 * 
 *   # Run tests with error logging to console
 *   MSNODESQLV8_TEST_LOG_LEVEL=ERROR MSNODESQLV8_TEST_LOG_CONSOLE=true npm test
 * 
 *   # Run tests with full trace logging
 *   MSNODESQLV8_TEST_VERBOSE=true npm test
 * 
 *   # Run tests with debug logging to file
 *   MSNODESQLV8_TEST_LOG_LEVEL=DEBUG MSNODESQLV8_TEST_LOG_FILE=/tmp/test.log npm test
 */

function configureTestLogging(sql) {
  // Check for verbose shortcut first
  if (process.env.MSNODESQLV8_TEST_VERBOSE === 'true') {
    sql.logger.setLogLevel(sql.LogLevel.TRACE)
    sql.logger.setConsoleLogging(true)
    console.log('Test logging: VERBOSE mode enabled (TRACE level to console)')
    return
  }

  // Set log level (default: SILENT)
  const logLevel = process.env.MSNODESQLV8_TEST_LOG_LEVEL || 'SILENT'
  if (sql.LogLevel[logLevel] !== undefined) {
    sql.logger.setLogLevel(sql.LogLevel[logLevel])
  } else {
    console.warn(`Invalid log level: ${logLevel}, using SILENT`)
    sql.logger.setLogLevel(sql.LogLevel.SILENT)
  }

  // Configure console logging (default: false)
  const consoleLogging = process.env.MSNODESQLV8_TEST_LOG_CONSOLE === 'true'
  sql.logger.setConsoleLogging(consoleLogging)

  // Configure file logging if specified
  const logFile = process.env.MSNODESQLV8_TEST_LOG_FILE
  if (logFile) {
    sql.logger.setLogFile(logFile)
  }

  // Only show configuration if not silent
  if (logLevel !== 'SILENT') {
    const config = sql.logger.getConfiguration()
    console.log('Test logging configured:', {
      level: logLevel,
      console: consoleLogging,
      file: logFile || 'none'
    })
  }
}

module.exports = { configureTestLogging }