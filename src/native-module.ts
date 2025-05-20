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
  readonly connectionId: number
  readonly statementId: number
}

export interface ColumnDefinition {
  colName: string
  colNameLength: number
  dataType: number
  columnSize: number
  decimalDigits: number
  nullable?: number
}

export type OdbcScalarValue =
    | string
    | number
    | boolean
    | Date
    | bigint
    | Buffer // For binary data
    | null // For NULL values

export type OdbcRow = Record<string, OdbcScalarValue>

export interface QueryResult {
  readonly meta: ColumnDefinition[]
  readonly handle: StatementHandle
  readonly rows?: OdbcRow[]
  readonly endOfRows: boolean
  readonly endOfResults: boolean
}

export interface QueryOptions {
  asObjects: boolean
  asArrays: boolean
  batchSize: boolean
}

export type QueryUserCallback = (err: Error | null, result?: QueryResult) => void
export type CloseConnectionCallback = (err: Error | null) => void
export type OpenConnectionCallback = (err: Error | null, conn?: any) => void

export interface NativeConnection {
  open: (connectionString: string, callback: OpenConnectionCallback) => void
  close: (callback: CloseConnectionCallback) => void
  query: (sql: string, params: any[], callback: QueryUserCallback) => void
  fetchRows: (handle: StatementHandle, options: QueryOptions, callback: QueryUserCallback) => void
  nextResultSet: (handle: StatementHandle, options: QueryOptions, callback: QueryUserCallback) => void
  cancelStatement: (handle: StatementHandle, callback: (err: Error | null) => void) => void
  releaseStatement: (handle: StatementHandle, callback: (err: Error | null) => void) => void
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
    try {
      // Check for both potential locations of the module
      const buildPaths = [
        path.join(__dirname, '..', 'build', buildType, 'sqlserver.node'),
        path.join(__dirname, '..', '..', 'build', buildType, 'sqlserver.node')
      ]

      for (const fullPath of buildPaths) {
        if (fs.existsSync(fullPath)) {
          return require(fullPath)
        }
      }
    } catch (e) {
      // Silently continue to the next option
    }
  }

  // If we got here, no module was found
  throw new Error('Could not load the sqlserver native module. Make sure it is compiled properly.')
}
