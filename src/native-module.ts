// src/native-module.ts
import * as path from 'path'
import * as fs from 'fs'

// Define the interface for the native module
export interface NativeModule {
  Connection: new () => NativeConnection
  setLogLevel: (level: number) => void
  enableConsoleLogging: (enable: boolean) => void
  setLogFile: (path: string) => void
}

export interface StatementHandle {
  connectionId: number
  statementId: number
}

export interface QueryResult {
  meta: any
  handle: StatementHandle
}

export type QueryUserCallback = (err: Error | null, result: QueryResult | null) => void

export interface NativeConnection {
  open: (connectionString: string, callback: (err: Error | null, conn?: any) => void) => void
  close: (callback: (err: Error | null) => void) => void
  query: (sql: string, params: any[], callback: QueryUserCallback) => void
  fetchRows: (statementId: number, batchSize: number, callback: (err: Error | null, rows?: any[], hasMore?: boolean) => void) => void
  nextResultSet: (statementId: number, callback: (err: Error | null, hasMore?: boolean, metadata?: any) => void) => void
  cancelStatement: (statementId: number, callback: (err: Error | null) => void) => void
}

export interface NativeQuery {
  on: (event: string, handler: Function) => void
  cancelQuery: (callback?: Function) => void
}

export interface NativeStatement {
  getMetadata: (callback: (err: Error | null, metadata?: any) => void) => void
  fetchRows: (batchSize: number, callback: (err: Error | null, rows?: any[], hasMore?: boolean) => void) => void
  nextResultSet: (callback: (err: Error | null, hasMore?: boolean, metadata?: any) => void) => void
  cancel: (callback: (err: Error | null) => void) => void
}

/**
 * Find and load the appropriate native module based on environment and availability
 */
export function loadNativeModule (): NativeModule {
  // Check for environment variable to override module selection
  const forcedBuild = process.env.SQLSERVER_BUILD
  if (forcedBuild && (forcedBuild === 'Debug' || forcedBuild === 'Release')) {
    return require(`../build/${forcedBuild}/sqlserver`)
  }

  // Default paths to check
  const buildTypes = process.env.NODE_ENV === 'production'
    ? ['Release', 'Debug']
    : ['Debug', 'Release']

  for (const buildType of buildTypes) {
    const modulePath = path.join(__dirname, '..', 'build', buildType, 'sqlserver')
    try {
      // Check if the file exists before requiring
      const moduleName = 'sqlserver.node'
      const fullPath = path.join(modulePath, '..', moduleName)

      if (fs.existsSync(fullPath)) {
        return require(fullPath)
      }
    } catch (e) {
      // Silently continue to the next option
    }
  }

  // If we got here, no module was found
  throw new Error('Could not load the sqlserver native module. Make sure it is compiled properly.')
}
