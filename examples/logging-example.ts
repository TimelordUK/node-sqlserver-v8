// examples/logging-example.ts
import { logger, createLogger, LogLevel } from '../src/logger-facade'
import { createConnection } from '../src'

// Example 1: Configure for development
logger.configureDevelopment({
  logLevel: LogLevel.DEBUG
})

// Example 2: Configure for production
// logger.configureProduction({
//   logDirectory: '/var/log/myapp',
//   logLevel: LogLevel.INFO,
//   rotateDaily: true
// })

// Example 3: Configure for testing
// logger.configureTest({
//   logLevel: LogLevel.TRACE,
//   silent: false,
//   logFile: './test-logs/test.log'
// })

// Create a class-specific logger
const connectionLogger = createLogger('ConnectionManager', { 
  module: 'database',
  version: '1.0.0'
})

// Use the logger
logger.info('Application starting...')
connectionLogger.debug('Initializing connection pool')

// Both TypeScript and C++ logs will be coordinated
async function demonstrateLogging() {
  try {
    const conn = createConnection()
    
    connectionLogger.info('Opening database connection', { 
      timestamp: new Date().toISOString() 
    })
    
    await conn.promises.open('Driver={ODBC Driver 18 for SQL Server};Server=127.0.0.1,1433;Database=node;UID=node_user;PWD=StrongPassword123!;TrustServerCertificate=yes;')
    
    connectionLogger.info('Connection established successfully')
    
    // The C++ logger will also output during query execution
    const result = await conn.promises.submitReadAll('SELECT 1 as test')
    
    logger.debug('Query result', { rows: result })
    
    await conn.promises.close()
    connectionLogger.info('Connection closed')
    
  } catch (error) {
    connectionLogger.error('Database error occurred', { 
      error: error.message,
      stack: error.stack 
    })
  }
}

// Log configuration info
const config = logger.getConfiguration()
logger.info('Current logger configuration', config)

// Run the example
demonstrateLogging().catch(console.error)