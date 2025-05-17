// src/logger.ts
import * as fs from 'fs'
import * as path from 'path'

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
export class FileAppender implements LogAppender {
  private readonly filePath: string
  private writeStream?: fs.WriteStream

  constructor (filePath: string) {
    this.filePath = filePath
    this.initializeStream()
  }

  private initializeStream (): void {
    const fs = require('fs')
    const path = require('path')

    // Ensure directory exists
    const dir = path.dirname(this.filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // Create write stream with append mode
    this.writeStream = fs.createWriteStream(this.filePath, {
      flags: 'a',
      encoding: 'utf8'
    })
  }

  log (level: LogLevel, message: string, context?: Record<string, any>): void {
    const timestamp = new Date().toISOString()
    const levelStr = LogLevel[level]
    const contextStr = context ? ` [${this.formatContext(context)}]` : ''

    const logLine = `[${timestamp}] [${levelStr}]${contextStr} ${message}\n`
    this.writeStream?.write(logLine)
  }

  private formatContext (context: Record<string, any>): string {
    return Object.entries(context)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ')
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

  /**
   * Reset the singleton instance (mainly for testing)
   */
  public static reset (): void {
    if (Logger.instance) {
      Logger.instance.clearAppenders()
    }
    Logger.instance = null as any
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
    if (level > this.minLevel) {
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
