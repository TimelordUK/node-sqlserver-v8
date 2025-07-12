'use strict'
const { threadId, isMainThread } = require('worker_threads')
const fs = require('fs')
const path = require('path')

// Handle EPIPE errors gracefully when piping output
process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') {
    process.exit(0)
  }
})

process.stderr.on('error', (err) => {
  if (err.code === 'EPIPE') {
    process.exit(0)
  }
})

// Mirror the C++ LogLevel enum
const LogLevel = {
  SILENT: 0,
  ERROR: 1,
  WARNING: 2,
  INFO: 3,
  DEBUG: 4,
  TRACE: 5
}

// Reverse mapping for string conversion
const LogLevelNames = {
  0: 'SILENT',
  1: 'ERROR',
  2: 'WARNING',
  3: 'INFO',
  4: 'DEBUG',
  5: 'TRACE'
}

class Logger {
  constructor () {
    this.currentLevel = LogLevel.SILENT
    this.consoleEnabled = false
    this.fileEnabled = false
    this.logFile = null
    this.writeStream = null
    this.nativeModule = null
  }

  /**
   * Initialize the logger with the native module
   * @param {Object} nativeModule - The native C++ module
   */
  initialize (nativeModule) {
    this.nativeModule = nativeModule
    // Sync current configuration with native module
    this.syncWithNative()
  }

  /**
   * Set the log level for both JS and C++ loggers
   * @param {number|string} level - Log level (number or string like 'DEBUG')
   */
  setLogLevel (level) {
    if (typeof level === 'string') {
      level = LogLevel[level.toUpperCase()] || LogLevel.INFO
    }

    this.currentLevel = level
    if (this.nativeModule?.setLogLevel) {
      this.nativeModule.setLogLevel(level)
    }
  }

  /**
   * Enable or disable console logging
   * @param {boolean} enabled
   */
  setConsoleLogging (enabled) {
    this.consoleEnabled = enabled
    if (this.nativeModule?.enableConsoleLogging) {
      this.nativeModule.enableConsoleLogging(enabled)
    }
  }

  /**
   * Set the log file path
   * @param {string|null} filePath
   */
  setLogFile (filePath) {
    // Close existing stream if any
    if (this.writeStream) {
      this.writeStream.end()
      this.writeStream = null
    }

    this.logFile = filePath
    this.fileEnabled = !!filePath

    if (filePath) {
      // Ensure directory exists
      const dir = path.dirname(filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      // Create write stream
      this.writeStream = fs.createWriteStream(filePath, {
        flags: 'a',
        encoding: 'utf8'
      })
    }

    // Update native module
    if (this.nativeModule?.setLogFile) {
      this.nativeModule.setLogFile(filePath ?? '')
    }
  }

  /**
   * Sync current configuration with native module
   */
  syncWithNative () {
    if (!this.nativeModule) return

    if (this.nativeModule.setLogLevel) {
      this.nativeModule.setLogLevel(this.currentLevel)
    }
    if (this.nativeModule.enableConsoleLogging) {
      this.nativeModule.enableConsoleLogging(this.consoleEnabled)
    }
    if (this.nativeModule.setLogFile) {
      this.nativeModule.setLogFile(this.logFile ?? '')
    }
  }

  /**
   * Check if a log level is enabled
   * @param {number} level
   * @returns {boolean}
   */
  isEnabled (level) {
    return this.currentLevel >= level
  }

  /**
   * Format a log message with timestamp and level
   * @param {number} level
   * @param {string} message
   * @param {string} [context] - Optional context (e.g., function name)
   * @returns {string}
   */
  formatMessage (level, message, context) {
    const timestamp = new Date().toISOString()
    const levelStr = LogLevelNames[level] || 'UNKNOWN'
    const contextStr = context ? `[${context}] ` : ''
    return `[${timestamp}] [JS ] [${isMainThread ? '           Main' : threadId}] [${levelStr}] ${contextStr}${message}`
  }

  /**
   * Log a message
   * @param {number} level
   * @param {string} message
   * @param {string} [context]
   */
  log (level, message, context) {
    if (!this.isEnabled(level)) return

    const formattedMessage = this.formatMessage(level, message, context)

    // Console output
    if (this.consoleEnabled) {
      // Use stderr for errors and warnings like C++ logger
      const output = level <= LogLevel.WARNING ? console.error : console.log
      output(formattedMessage)
    }

    // File output
    if (this.fileEnabled && this.writeStream) {
      this.writeStream.write(formattedMessage + '\n')
    }
  }

  // Convenience methods
  error (message, context) {
    if (!this.isEnabled(LogLevel.ERROR)) return
    this.log(LogLevel.ERROR, message, context)
  }

  warning (message, context) {
    if (!this.isEnabled(LogLevel.WARNING)) return
    this.log(LogLevel.WARNING, message, context)
  }

  info (message, context) {
    if (!this.isEnabled(LogLevel.INFO)) return
    this.log(LogLevel.INFO, message, context)
  }

  debug (message, context) {
    if (!this.isEnabled(LogLevel.DEBUG)) return
    this.log(LogLevel.DEBUG, message, context)
  }

  trace (message, context) {
    if (!this.isEnabled(LogLevel.TRACE)) return
    this.log(LogLevel.TRACE, message, context)
  }

  // Lazy evaluation methods for performance
  traceLazy (messageProvider, context) {
    if (!this.isEnabled(LogLevel.TRACE)) return
    this.log(LogLevel.TRACE, messageProvider(), context)
  }

  debugLazy (messageProvider, context) {
    if (!this.isEnabled(LogLevel.DEBUG)) return
    this.log(LogLevel.DEBUG, messageProvider(), context)
  }

  infoLazy (messageProvider, context) {
    if (!this.isEnabled(LogLevel.INFO)) return
    this.log(LogLevel.INFO, messageProvider(), context)
  }

  /**
   * Configure for production environment
   * @param {string} logDir
   */
  configureForProduction (logDir) {
    const logFile = path.join(logDir, `msnodesqlv8-${new Date().toISOString().split('T')[0]}.log`)
    this.setLogLevel(LogLevel.INFO)
    this.setConsoleLogging(false)
    this.setLogFile(logFile)
  }

  configureForInfoConsole () {
    this.setLogLevel(LogLevel.INFO)
    this.setConsoleLogging(true)
    this.setLogFile(null)
  }

  /**
   * Configure for development environment
   */
  configureForDevelopment () {
    this.setLogLevel(LogLevel.DEBUG)
    this.setConsoleLogging(true)
    this.setLogFile(null)
  }

  /**
   * Configure for testing environment
   * @param {string} [tempLogFile]
   */
  configureForTesting (tempLogFile) {
    this.setLogLevel(LogLevel.TRACE)
    this.setConsoleLogging(true)
    this.setLogFile(tempLogFile ?? null)
  }

  /**
   * Get current configuration
   * @returns {Object}
   */
  getConfiguration () {
    return {
      logLevel: this.currentLevel,
      logLevelName: LogLevelNames[this.currentLevel],
      consoleEnabled: this.consoleEnabled,
      fileEnabled: this.fileEnabled,
      logFile: this.logFile
    }
  }

  /**
   * Close the logger and clean up resources
   */
  close () {
    if (this.writeStream) {
      this.writeStream.end()
      this.writeStream = null
    }
  }
}

// Create singleton instance
const logger = new Logger()

// Export the logger instance and constants
module.exports = {
  logger,
  LogLevel,
  LogLevelNames
}
