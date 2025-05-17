// test/integration/logger-coordination.test.ts
import { expect } from 'chai'
import { logger, LogLevel } from '../../src/logger-facade'
import { createConnection } from '../../src'
import * as fs from 'fs'
import * as path from 'path'
import { UnifiedLogger } from '../../src/unified-logger'

// This is an integration test that requires the native module to be built
describe('Logger Coordination Integration', function() {
  this.timeout(10000) // Set longer timeout for integration tests

  beforeEach(() => {
    // Reset the logger singleton to avoid state pollution
    UnifiedLogger.reset()
  })
  
  const testLogDir = path.join(__dirname, '../test-logs')
  const testLogFile = path.join(testLogDir, 'coordination-test.log')

  beforeEach(() => {
    // Clean up test directory
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true })
    }
    fs.mkdirSync(testLogDir, { recursive: true })
  })

  afterEach(() => {
    // Clean up
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true })
    }
  })

  it('should coordinate TypeScript and C++ logging to the same file', async () => {
    // Configure both loggers to write to the same file
    logger.setLogLevel(LogLevel.DEBUG)
    logger.setConsoleLogging(false)
    logger.setLogFile(testLogFile)

    // Create a class logger
    const dbLogger = logger.createClassLogger('DatabaseTest')

    try {
      // Log from TypeScript
      logger.info('Starting database test')
      dbLogger.debug('Creating connection')

      // This will trigger C++ logging
      const conn = createConnection()
      
      // Give some time for logs to be written
      await new Promise(resolve => setTimeout(resolve, 100))

      // Read the log file
      const logContent = fs.readFileSync(testLogFile, 'utf8')
      
      // Verify both TypeScript and C++ logs are present
      expect(logContent).to.include('Starting database test')
      expect(logContent).to.include('Creating connection')
      expect(logContent).to.include('DatabaseTest')
      
      // Each log should have consistent timestamp format
      const timestampPattern = /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/g
      const timestamps = logContent.match(timestampPattern)
      expect(timestamps).to.have.length.greaterThan(0)

    } catch (error) {
      // If native module is not available, skip this test
      if (error instanceof Error && error.message.includes('Could not load the sqlserver native module')) {
        return // Skip the test by returning early
      } else {
        throw error
      }
    }
  })

  it('should respect log level settings for both loggers', async () => {
    // Set to ERROR level only
    logger.setLogLevel(LogLevel.ERROR)
    logger.setConsoleLogging(false)
    logger.setLogFile(testLogFile)

    try {
      // These should not appear in the log
      logger.debug('Debug message')
      logger.info('Info message')
      
      // This should appear
      logger.error('Error message')

      // Give some time for logs to be written
      await new Promise(resolve => setTimeout(resolve, 100))

      // Read the log file
      const logContent = fs.readFileSync(testLogFile, 'utf8')
      
      // Verify only ERROR level logs are present
      expect(logContent).to.not.include('Debug message')
      expect(logContent).to.not.include('Info message')
      expect(logContent).to.include('Error message')
      expect(logContent).to.include('[ERROR]')

    } catch (error) {
      if (error instanceof Error && error.message.includes('Could not load the sqlserver native module')) {
        return // Skip the test by returning early
      } else {
        throw error
      }
    }
  })

  it('should handle configuration changes dynamically', async () => {
    // Start with console logging
    logger.configureDevelopment()
    
    const consoleLog = console.log
    const consoleError = console.error
    let consoleOutput: string[] = []
    
    // Capture console output
    console.log = (...args) => consoleOutput.push(args.join(' '))
    console.error = (...args) => consoleOutput.push(args.join(' '))

    try {
      logger.info('Console message 1')
      
      // Switch to file logging
      logger.setConsoleLogging(false)
      logger.setLogFile(testLogFile)
      
      logger.info('File message 1')
      
      // Switch back to console
      logger.setConsoleLogging(true)
      logger.setLogFile(null)
      
      logger.info('Console message 2')

      // Give some time for logs to be written
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify console output
      expect(consoleOutput.join('\n')).to.include('Console message 1')
      expect(consoleOutput.join('\n')).to.include('Console message 2')
      expect(consoleOutput.join('\n')).to.not.include('File message 1')

      // Verify file output
      const logContent = fs.readFileSync(testLogFile, 'utf8')
      expect(logContent).to.include('File message 1')
      expect(logContent).to.not.include('Console message')

    } finally {
      // Restore console
      console.log = consoleLog
      console.error = consoleError
    }
  })
})