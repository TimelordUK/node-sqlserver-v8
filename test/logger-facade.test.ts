// test/logger-facade.test.ts
import { expect } from 'chai'
import { LoggerFacade, logger, createLogger } from '../src/logger-facade'
import { LogLevel } from '../src'
import * as sinon from 'sinon'
import { UnifiedLogger } from '../src/unified-logger'

describe('LoggerFacade', () => {
  let facade: LoggerFacade
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    // Reset unified logger singleton for clean test state
    UnifiedLogger.reset()
    facade = new LoggerFacade()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('Configuration Methods', () => {
    it('should configure for production', () => {
      facade.configureProduction({
        logDirectory: '~/var/log/app',
        logLevel: LogLevel.WARNING
      })

      const config = facade.getConfiguration()
      expect(config.logLevel).to.equal(LogLevel.WARNING)
      expect(config.consoleEnabled).to.be.false
      expect(config.logFile).to.include('~/var/log/app')
    })

    it('should configure for production with daily rotation', () => {
      const today = new Date().toISOString().split('T')[0]
      facade.configureProduction({
        logDirectory: '~/var/log/app',
        rotateDaily: true
      })

      const config = facade.getConfiguration()
      expect(config.logFile).to.include(today)
    })

    it('should configure for development with defaults', () => {
      facade.configureDevelopment()

      const config = facade.getConfiguration()
      expect(config.logLevel).to.equal(LogLevel.DEBUG)
      expect(config.consoleEnabled).to.be.true
      expect(config.logFile).to.be.null
    })

    it('should configure for development with custom options', () => {
      facade.configureDevelopment({
        logLevel: LogLevel.TRACE,
        logFile: './dev.log'
      })

      const config = facade.getConfiguration()
      expect(config.logLevel).to.equal(LogLevel.TRACE)
      expect(config.logFile).to.equal('./dev.log')
    })

    it('should configure for test environment', () => {
      facade.configureTest({
        logLevel: LogLevel.ERROR,
        silent: true,
        logFile: './test.log'
      })

      const config = facade.getConfiguration()
      expect(config.logLevel).to.equal(LogLevel.ERROR)
      expect(config.consoleEnabled).to.be.false
      expect(config.logFile).to.equal('./test.log')
    })
  })

  describe('Logging Methods', () => {
    let consoleStub: sinon.SinonStub
    let errorStub: sinon.SinonStub

    beforeEach(() => {
      consoleStub = sandbox.stub(console, 'log')
      errorStub = sandbox.stub(console, 'error')
      facade.configureDevelopment()
    })

    it('should log error messages', () => {
      facade.error('Test error', { code: 'ERR001' })
      expect(errorStub.called).to.be.true
      const loggedMessage = errorStub.firstCall.args[0]
      expect(loggedMessage).to.include('ERROR')
      expect(loggedMessage).to.include('Test error')
    })

    it('should log warning messages', () => {
      facade.warn('Test warning')
      expect(errorStub.called).to.be.true
      const loggedMessage = errorStub.firstCall.args[0]
      expect(loggedMessage).to.include('WARNING')
      expect(loggedMessage).to.include('Test warning')
    })

    it('should log info messages', () => {
      facade.info('Test info')
      expect(consoleStub.called).to.be.true
      const loggedMessage = consoleStub.firstCall.args[0]
      expect(loggedMessage).to.include('INFO')
      expect(loggedMessage).to.include('Test info')
    })

    it('should log debug messages', () => {
      facade.debug('Test debug', { debugInfo: 'value' })
      expect(consoleStub.called).to.be.true
      const loggedMessage = consoleStub.firstCall.args[0]
      expect(loggedMessage).to.include('DEBUG')
      expect(loggedMessage).to.include('Test debug')
    })

    it('should log trace messages', () => {
      facade.setLogLevel(LogLevel.TRACE)
      facade.trace('Test trace')
      expect(consoleStub.called).to.be.true
      const loggedMessage = consoleStub.firstCall.args[0]
      expect(loggedMessage).to.include('TRACE')
      expect(loggedMessage).to.include('Test trace')
    })
  })

  describe('Class Logger Creation', () => {
    it('should create a class logger', () => {
      const classLogger = facade.createClassLogger('TestClass')
      expect(classLogger).to.exist
      expect(classLogger.info).to.be.a('function')
      expect(classLogger.error).to.be.a('function')
    })

    it('should create a class logger with context', () => {
      const classLogger = facade.createClassLogger('TestClass', {
        module: 'test',
        version: '1.0.0'
      })
      expect(classLogger).to.exist
    })
  })

  describe('Configuration Methods', () => {
    it('should set log level', () => {
      facade.setLogLevel(LogLevel.ERROR)
      const config = facade.getConfiguration()
      expect(config.logLevel).to.equal(LogLevel.ERROR)
    })

    it('should set console logging', () => {
      facade.setConsoleLogging(false)
      const config = facade.getConfiguration()
      expect(config.consoleEnabled).to.be.false
    })

    it('should set log file', () => {
      facade.setLogFile('./custom.log')
      const config = facade.getConfiguration()
      expect(config.logFile).to.equal('./custom.log')
    })
  })

  describe('Module Exports', () => {
    it('should export singleton logger instance', () => {
      expect(logger).to.be.instanceof(LoggerFacade)
    })

    it('should export createLogger helper', () => {
      const classLogger = createLogger('TestClass')
      expect(classLogger).to.exist
      expect(classLogger.info).to.be.a('function')
    })
  })

  describe('Integration with UnifiedLogger', () => {
    it('should coordinate TypeScript and C++ logger settings', () => {
      facade.setLogLevel(LogLevel.WARNING)
      facade.setConsoleLogging(false)
      facade.setLogFile('./integration.log')

      const config = facade.getConfiguration()
      expect(config.logLevel).to.equal(LogLevel.WARNING)
      expect(config.consoleEnabled).to.be.false
      expect(config.logFile).to.equal('./integration.log')
    })
  })
})
