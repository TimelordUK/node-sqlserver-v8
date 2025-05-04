// src/logger.ts
export enum LogLevel {
  SILENT = 0,
  ERROR = 1,
  WARNING = 2,
  INFO = 3,
  DEBUG = 4,
  TRACE = 5
}

export interface LogAppender {
  log: (level: LogLevel, message: string, context?: Record<string, any>) => void
}

export class ConsoleAppender implements LogAppender {
  log (level: LogLevel, message: string, context?: Record<string, any>): void {
    // Keep the ISO timestamp format with milliseconds
    const timestamp = new Date().toISOString()
    const levelStr = LogLevel[level]
    const contextStr = context ? ` [${this.formatContext(context)}]` : ''

    console.log(`[${timestamp}] [${levelStr}]${contextStr} ${message}`)
  }

  private formatContext (context: Record<string, any>): string {
    return Object.entries(context)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ')
  }
}
export class FileAppender implements LogAppender {
  private readonly filePath: string

  constructor (filePath: string) {
    this.filePath = filePath
    // Initialize file logging (you might use fs.createWriteStream)
  }

  log (level: LogLevel, message: string, context?: Record<string, any>): void {
    // Implement file logging using Node.js fs module
  }
}

export class Logger {
  private static instance: Logger
  private appenders: LogAppender[] = []
  private minLevel: LogLevel = LogLevel.INFO
  private contextProvider?: () => Record<string, any>

  private constructor () {
    // Default appender
    this.appenders.push(new ConsoleAppender())
  }

  public static getInstance (): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }
    return Logger.instance
  }

  public setMinLevel (level: LogLevel): void {
    this.minLevel = level
  }

  public addAppender (appender: LogAppender): void {
    this.appenders.push(appender)
  }

  public clearAppenders (): void {
    this.appenders = []
  }

  public setContextProvider (provider: () => Record<string, any>): void {
    this.contextProvider = provider
  }

  public trace (message: string, context?: Record<string, any>): void {
    this.log(LogLevel.TRACE, message, context)
  }

  public debug (message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context)
  }

  public info (message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context)
  }

  public warn (message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARNING, message, context)
  }

  public error (message: string, context?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, context)
  }

  private log (level: LogLevel, message: string, additionalContext?: Record<string, any>): void {
    if (level < this.minLevel) {
      return
    }

    // Combine global context with additional context
    const baseContext = this.contextProvider ? this.contextProvider() : {}
    const context = additionalContext
      ? { ...baseContext, ...additionalContext }
      : baseContext

    for (const appender of this.appenders) {
      appender.log(level, message, context)
    }
  }
}

// Create a default export for convenience
export default Logger.getInstance()
