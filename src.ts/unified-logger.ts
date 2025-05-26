// src/unified-logger.ts
import { Logger, LogLevel, LogAppender } from './logger'
import { loadNativeModule, NativeModule } from './native-module'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Unified logger configuration that coordinates TypeScript and C++ loggers
 */
class UnifiedLogger {
  private static instance: UnifiedLogger
  private readonly tsLogger: Logger
  private nativeModule: NativeModule | null = null
  private currentLogFile: string | null = null
  private isConsoleEnabled: boolean = true
  private logLevel: LogLevel = LogLevel.INFO

  private constructor () {
    this.tsLogger = Logger.getInstance()
    this.initializeNativeModule()
  }

  public static getInstance (): UnifiedLogger {
    if (!UnifiedLogger.instance) {
      UnifiedLogger.instance = new UnifiedLogger()
    }
    return UnifiedLogger.instance
  }

  /**
   * Reset the singleton instance (mainly for testing)
   */
  public static reset (): void {
    if (UnifiedLogger.instance) {
      // Clear any existing appenders to release resources
      UnifiedLogger.instance.tsLogger.clearAppenders()
      UnifiedLogger.instance.currentLogFile = null
      UnifiedLogger.instance.isConsoleEnabled = true
      UnifiedLogger.instance.logLevel = LogLevel.INFO
    }
    UnifiedLogger.instance = null as any
  }

  private initializeNativeModule (): void {
    try {
      this.nativeModule = loadNativeModule()
      // Sync initial configuration
      this.syncConfiguration()
    } catch (error) {
      // Native module not available - TypeScript-only mode
      console.warn('Native module not available, using TypeScript-only logging')
    }
  }

  /**
   * Set the log level for both TypeScript and C++ loggers
   */
  public setLogLevel (level: LogLevel): void {
    this.logLevel = level
    this.tsLogger.setMinLevel(level)

    if (this.nativeModule) {
      this.nativeModule.setLogLevel(level)
    }
  }

  /**
   * Enable or disable console logging for both loggers
   */
  public setConsoleLogging (enabled: boolean): void {
    this.isConsoleEnabled = enabled
    this.updateAppenders()

    // Update C++ logger
    if (this.nativeModule) {
      this.nativeModule.enableConsoleLogging(enabled)
    }
  }

  /**
   * Set the log file for both loggers
   */
  public setLogFile (filePath: string | null): void {
    this.currentLogFile = filePath
    this.updateAppenders()

    // Update C++ logger
    if (this.nativeModule) {
      if (filePath) {
        this.nativeModule.setLogFile(filePath)
      } else {
        this.nativeModule.setLogFile('')
      }
    }
  }

  /**
   * Update TypeScript logger appenders based on current configuration
   */
  private updateAppenders (): void {
    this.tsLogger.clearAppenders()

    if (this.isConsoleEnabled) {
      this.tsLogger.addAppender(new ConsoleAppender())
    }

    if (this.currentLogFile) {
      this.tsLogger.addAppender(new FileAppenderImpl(this.currentLogFile))
    }
  }

  /**
   * Sync current configuration to native module
   */
  private syncConfiguration (): void {
    if (!this.nativeModule) return

    this.nativeModule.setLogLevel(this.logLevel)
    this.nativeModule.enableConsoleLogging(this.isConsoleEnabled)

    if (this.currentLogFile) {
      this.nativeModule.setLogFile(this.currentLogFile)
    }
  }

  /**
   * Create a configuration preset for production
   */
  public configureForProduction (logDir: string): void {
    const logFile = path.join(logDir, `app-${new Date().toISOString().split('T')[0]}.log`)

    this.setLogLevel(LogLevel.INFO)
    this.setConsoleLogging(false)
    this.setLogFile(logFile)
  }

  /**
   * Create a configuration preset for development
   */
  public configureForDevelopment (): void {
    this.setLogLevel(LogLevel.DEBUG)
    this.setConsoleLogging(true)
    this.setLogFile(null)
  }

  /**
   * Create a configuration preset for testing
   */
  public configureForTesting (tempLogFile?: string): void {
    this.setLogLevel(LogLevel.TRACE)
    this.setConsoleLogging(true)
    this.setLogFile(tempLogFile || null)
  }

  /**
   * Get the TypeScript logger instance
   */
  public getLogger (): Logger {
    return this.tsLogger
  }

  /**
   * Get current logger configuration
   */
  public getConfiguration (): {
    logLevel: LogLevel
    consoleEnabled: boolean
    logFile: string | null
  } {
    return {
      logLevel: this.logLevel,
      consoleEnabled: this.isConsoleEnabled,
      logFile: this.currentLogFile
    }
  }
}

/**
 * Console appender implementation
 */
class ConsoleAppender implements LogAppender {
  log (level: LogLevel, message: string, context?: Record<string, any>): void {
    const timestamp = new Date().toISOString()
    const levelStr = LogLevel[level]
    const contextStr = context ? ` [${this.formatContext(context)}]` : ''

    // Use stderr for error/warning levels to match C++ logger behavior
    const output = level <= LogLevel.WARNING ? console.error : console.log
    output(`[${timestamp}] [${levelStr}]${contextStr} ${message}`)
  }

  private formatContext (context: Record<string, any>): string {
    return Object.entries(context)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ')
  }
}

/**
 * File appender implementation
 */
class FileAppenderImpl implements LogAppender {
  private readonly writeStream: fs.WriteStream

  constructor (filePath: string) {
    // Create directory if it doesn't exist
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    this.writeStream = fs.createWriteStream(filePath, {
      flags: 'a',
      encoding: 'utf8'
    })
  }

  log (level: LogLevel, message: string, context?: Record<string, any>): void {
    const timestamp = new Date().toISOString()
    const levelStr = LogLevel[level]
    const contextStr = context ? ` [${this.formatContext(context)}]` : ''

    const logLine = `[${timestamp}] [${levelStr}]${contextStr} ${message}\n`
    this.writeStream.write(logLine)
  }

  private formatContext (context: Record<string, any>): string {
    return Object.entries(context)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ')
  }
}

// Export the singleton instance
export default UnifiedLogger.getInstance()

// Export the class for testing purposes
export { UnifiedLogger }
