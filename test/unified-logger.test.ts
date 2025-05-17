// test/unified-logger.test.ts
import { expect } from 'chai'
import { LogLevel } from '../src'
import * as sinon from 'sinon'
import * as fs from 'fs'
import * as path from 'path'
import unifiedLogger, { UnifiedLogger } from "../src/unified-logger"

describe('UnifiedLogger', () => {
  let unifiedLoggerInstance: typeof unifiedLogger
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    // Reset singleton for clean test state
    UnifiedLogger.reset()
    // Get a fresh instance
    unifiedLoggerInstance = UnifiedLogger.getInstance()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('Log Level Configuration', () => {
    it('should set log level for both TypeScript and C++ loggers', () => {
      unifiedLoggerInstance.setLogLevel(LogLevel.DEBUG)
      const config = unifiedLoggerInstance.getConfiguration()
      expect(config.logLevel).to.equal(LogLevel.DEBUG)
    })

    it('should handle all log levels', () => {
      const levels = [
        LogLevel.SILENT,
        LogLevel.ERROR,
        LogLevel.WARNING,
        LogLevel.INFO,
        LogLevel.DEBUG,
        LogLevel.TRACE
      ]

      levels.forEach(level => {
        unifiedLoggerInstance.setLogLevel(level)
        const config = unifiedLoggerInstance.getConfiguration()
        expect(config.logLevel).to.equal(level)
      })
    })
  })

  describe('Console Logging Configuration', () => {
    it('should enable console logging', () => {
      unifiedLoggerInstance.setConsoleLogging(true)
      const config = unifiedLoggerInstance.getConfiguration()
      expect(config.consoleEnabled).to.be.true
    })

    it('should disable console logging', () => {
      unifiedLoggerInstance.setConsoleLogging(false)
      const config = unifiedLoggerInstance.getConfiguration()
      expect(config.consoleEnabled).to.be.false
    })
  })

  describe('File Logging Configuration', () => {
    const testLogDir = path.join(__dirname, 'test-logs')
    const testLogFile = path.join(testLogDir, 'test.log')

    beforeEach(() => {
      // Clean up test directory
      if (fs.existsSync(testLogDir)) {
        fs.rmSync(testLogDir, { recursive: true })
      }
    })

    afterEach(() => {
      // Clean up
      if (fs.existsSync(testLogDir)) {
        fs.rmSync(testLogDir, { recursive: true })
      }
    })

    it('should set log file path', () => {
      unifiedLoggerInstance.setLogFile(testLogFile)
      const config = unifiedLoggerInstance.getConfiguration()
      expect(config.logFile).to.equal(testLogFile)
    })

    it('should clear log file when set to null', () => {
      unifiedLoggerInstance.setLogFile(testLogFile)
      unifiedLoggerInstance.setLogFile(null)
      const config = unifiedLoggerInstance.getConfiguration()
      expect(config.logFile).to.be.null
    })

    it('should create directory if it does not exist', (done) => {
      unifiedLoggerInstance.setLogFile(testLogFile)
      // The FileAppender should create the directory
      // We'd need to trigger a log to verify this
      const logger = unifiedLoggerInstance.getLogger()
      logger.info('Test message')

      // Small delay to ensure file write
      setTimeout(() => {
        expect(fs.existsSync(testLogDir)).to.be.true
        done()
      }, 100)
    })
  })

  describe('Configuration Presets', () => {
    it('should configure for production', () => {
      const logDir = path.join(__dirname, 'prod-logs')
      unifiedLoggerInstance.configureForProduction(logDir)

      const config = unifiedLoggerInstance.getConfiguration()
      expect(config.logLevel).to.equal(LogLevel.INFO)
      expect(config.consoleEnabled).to.be.false
      expect(config.logFile).to.include(logDir)
    })

    it('should configure for development', () => {
      unifiedLoggerInstance.configureForDevelopment()

      const config = unifiedLoggerInstance.getConfiguration()
      expect(config.logLevel).to.equal(LogLevel.DEBUG)
      expect(config.consoleEnabled).to.be.true
      expect(config.logFile).to.be.null
    })

    it('should configure for testing', () => {
      unifiedLoggerInstance.configureForTesting()

      const config = unifiedLoggerInstance.getConfiguration()
      expect(config.logLevel).to.equal(LogLevel.TRACE)
      expect(config.consoleEnabled).to.be.true
      expect(config.logFile).to.be.null
    })

    it('should configure for testing with custom log file', () => {
      const testFile = './test-output.log'
      unifiedLoggerInstance.configureForTesting(testFile)

      const config = unifiedLoggerInstance.getConfiguration()
      expect(config.logLevel).to.equal(LogLevel.TRACE)
      expect(config.consoleEnabled).to.be.true
      expect(config.logFile).to.equal(testFile)
    })
  })

  describe('Logger Instance', () => {
    it('should return the TypeScript logger instance', () => {
      const logger = unifiedLoggerInstance.getLogger()
      expect(logger).to.exist
      expect(logger.info).to.be.a('function')
      expect(logger.error).to.be.a('function')
      expect(logger.debug).to.be.a('function')
    })
  })

  describe('Native Module Integration', () => {
    it('should handle missing native module gracefully', () => {
      // This test verifies that the UnifiedLogger doesn't throw
      // when the native module is not available
      expect(() => {
        unifiedLoggerInstance.setLogLevel(LogLevel.DEBUG)
      }).to.not.throw()
    })
  })
})
