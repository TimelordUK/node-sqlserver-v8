// src/logger-facade.ts
import unifiedLogger from './unified-logger'
import { LogLevel } from './logger'
import { ClassLogger } from './class-logger'

// Re-export LogLevel
export { LogLevel }

/**
 *
 * Logger facade that provides a simple API for both TypeScript and C++ logging
 */
export class LoggerFacade {
  private readonly unifiedLogger: typeof unifiedLogger

  constructor () {
    this.unifiedLogger = unifiedLogger
  }

  /**
   * Configure logging for production environment
   */
  public configureProduction (options: {
    logDirectory: string
    logLevel?: LogLevel
    rotateDaily?: boolean
  }): void {
    const level = options.logLevel ?? LogLevel.INFO
    this.unifiedLogger.setLogLevel(level)
    this.unifiedLogger.setConsoleLogging(false)

    // Generate log filename with optional daily rotation
    const logFile = options.rotateDaily
      ? `${options.logDirectory}/app-${new Date().toISOString().split('T')[0]}.log`
      : `${options.logDirectory}/app.log`

    this.unifiedLogger.setLogFile(logFile)
  }

  /**
   * Configure logging for development environment
   */
  public configureDevelopment (options?: {
    logLevel?: LogLevel
    logFile?: string
  }): void {
    const level = options?.logLevel ?? LogLevel.DEBUG
    this.unifiedLogger.setLogLevel(level)
    this.unifiedLogger.setConsoleLogging(true)
    this.unifiedLogger.setLogFile(options?.logFile ?? null)
  }

  /**
   * Configure logging for test environment
   */
  public configureTest (options?: {
    logLevel?: LogLevel
    silent?: boolean
    logFile?: string
  }): void {
    const level = options?.logLevel ?? LogLevel.TRACE
    this.unifiedLogger.setLogLevel(level)
    this.unifiedLogger.setConsoleLogging(!options?.silent)
    this.unifiedLogger.setLogFile(options?.logFile ?? null)
  }

  /**
   * Create a class-specific logger
   */
  public createClassLogger (className: string, context?: Record<string, any>): ClassLogger {
    return new ClassLogger(className, context)
  }

  /**
   * Direct logging methods
   */
  public error (message: string, context?: Record<string, any>): void {
    this.unifiedLogger.getLogger().error(message, context)
  }

  public warn (message: string, context?: Record<string, any>): void {
    this.unifiedLogger.getLogger().warn(message, context)
  }

  public info (message: string, context?: Record<string, any>): void {
    this.unifiedLogger.getLogger().info(message, context)
  }

  public debug (message: string, context?: Record<string, any>): void {
    this.unifiedLogger.getLogger().debug(message, context)
  }

  public trace (message: string, context?: Record<string, any>): void {
    this.unifiedLogger.getLogger().trace(message, context)
  }

  /**
   * Advanced configuration methods
   */
  public setLogLevel (level: LogLevel): void {
    this.unifiedLogger.setLogLevel(level)
  }

  public setConsoleLogging (enabled: boolean): void {
    this.unifiedLogger.setConsoleLogging(enabled)
  }

  public setLogFile (path: string | null): void {
    this.unifiedLogger.setLogFile(path)
  }

  /**
   * Get current configuration
   */
  public getConfiguration (): {
    logLevel: LogLevel
    consoleEnabled: boolean
    logFile: string | null
  } {
    return this.unifiedLogger.getConfiguration()
  }
}

// Export singleton instance for convenience
export const logger = new LoggerFacade()

// Export helper function for creating class loggers
export function createLogger (className: string, context?: Record<string, any>): ClassLogger {
  return logger.createClassLogger(className, context)
}
