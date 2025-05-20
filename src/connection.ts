// src/connection.ts
import {
  CloseConnectionCallback,
  NativeConnection,
  OpenConnectionCallback, QueryOptions,
  QueryResult,
  QueryUserCallback,
  StatementHandle
} from './native-module'
import { EventEmitter } from 'events'
import { AsyncQueue, QueueTask } from './async-queue'
import { ClassLogger } from './class-logger'
import { AggregatedResult, QueryAggregator } from './query-aggregator'
import { SqlParameter } from './sql-parameter'

/**
 * Wrapper for the native Connection class that enforces operation queuing
 */

class ConnectionPromises {
  constructor (public readonly connection: Connection) {
  }

  async open (connectionString: string): Promise<QueryResult | undefined> {
    return this.connection.open(connectionString)
  }

  async close (): Promise<void> {
    return this.connection.close()
  }

  async fetchRows (handle: StatementHandle, options: QueryOptions): Promise<QueryResult | undefined> {
    return this.connection.fetchRows(handle, options)
  }

  async nextResultSet (handle: StatementHandle): Promise<QueryResult | undefined> {
    return this.connection.nextResultSet(handle)
  }

  async releaseStatement (handle: StatementHandle): Promise<void> {
    return this.connection.releaseStatement(handle)
  }

  async submit (sql: string, params?: SqlParameter[]): Promise<QueryResult> {
    return new Promise<QueryResult>((resolve, reject) => {
      this.connection.query(sql, params, (err, result) => {
        if (err) reject(err)
        else resolve(result ?? {} as QueryResult)
      })
    })
  }

  async submitReadAll (sql: string, params?: any[]): Promise<AggregatedResult> {
    return new Promise<AggregatedResult>((resolve, reject) => {
      const sqlParams = params ? params.map(p => SqlParameter.fromValue(p)) : undefined
      this.connection.query(sql, sqlParams, async (err, result) => {
        if (err) reject(err)
        else {
          const qa = new QueryAggregator(this.connection, result!)
          const res = await qa.getResults()
          resolve(res)
        }
      })
    })
  }
}

// Define callback types with more flexibility
type NativeCallback<T> = (err: Error | null, result?: T, ...args: any[]) => void
type UserCallback<T> = (err: Error | null, result?: T, ...args: any[]) => void

export class Connection extends EventEmitter {
  private readonly _native: NativeConnection
  private readonly _queue: AsyncQueue = new AsyncQueue()
  private _closed = false
  public readonly _connectionId = 1
  private readonly _logger: ClassLogger
  public readonly promises: ConnectionPromises

  constructor (nativeConnection: NativeConnection) {
    super()
    this._native = nativeConnection
    this._logger = new ClassLogger('Connection', { connectionId: this._connectionId })
    this._logger.debug('Connection ctor')
    this.promises = new ConnectionPromises(this)
  }

  /**
   * Creates and enqueues a task with proper promise/callback handling
   * @param operation - Function that performs the actual native operation
   * @param callback - Optional user-provided callback
   * @param logMessage - Optional log message with context
   * @param logContext - Optional logging context
   * @returns Promise if no callback provided, undefined otherwise
   */
  private executeOperation<T>(
    operation: (callback: NativeCallback<T>) => void,
    callback?: UserCallback<T>,
    logMessage?: string,
    logContext?: object
  ): Promise<T> | undefined {
    const task: QueueTask = {
      execute: (done) => {
        if (logMessage && logContext) {
          this._logger.debug(logMessage, logContext)
        }

        operation((err, result, ...args) => {
          if (callback) callback(err, result, ...args)
          done()
        })
      },
      fail: (err) => {
        if (callback) callback(err)
      }
    }

    // Add promise if no callback provided
    if (!callback) {
      task.promise = new Promise<T>((resolve, reject) => {
        task.execute = (done) => {
          if (logMessage && logContext) {
            this._logger.debug(logMessage, logContext)
          }

          operation((err, result) => {
            if (err) reject(err)
            else resolve(result as T)
            done()
          })
        }
        task.fail = (err) => { reject(err) }
      })
    }

    return this.enqueueTask(task)
  }

  /**
   * Allows statements to enqueue tasks on this connection
   * This maintains the single-threaded queue while moving logic to Statement
   */
  async enqueueTask<T>(task: QueueTask): Promise<T> {
    return this._queue.enqueueTask(task)
  }

  /**
   * Open a connection to the database
   */
  open (connectionString: string, callback?: OpenConnectionCallback): Promise<QueryResult> | undefined {
    return this.executeOperation<QueryResult>(
      (cb) => { this._native.open(connectionString, cb) },
      callback,
      'Opening database connection',
      { connectionString }
    )
  }

  fetchRows (handle: StatementHandle, options: QueryOptions, callback?: OpenConnectionCallback): Promise<QueryResult> | undefined {
    return this.executeOperation<QueryResult>(
      (cb) => { this._native.fetchRows(handle, options, cb) },
      callback,
      'FetchRows'
    )
  }

  nextResultSet (handle: StatementHandle, callback?: OpenConnectionCallback): Promise<QueryResult> | undefined {
    return this.executeOperation<QueryResult>(
      (cb) => { this._native.nextResultSet(handle, cb) },
      callback,
      'FetchRows'
    )
  }

  /**
   * Close the database connection
   */
  close (callback?: CloseConnectionCallback): Promise<void> | undefined {
    return this.executeOperation(
      (cb) => {
        this._native.close((err) => {
          this._closed = true
          cb(err)
        })
      },
      callback
    )
  }

  /**
   * Release a statement handle and clean up resources
   */
  releaseStatement (handle: StatementHandle, callback?: (err: Error | null) => void): Promise<void> | undefined {
    return this.executeOperation(
      (cb) => {
        // For now, use the cancelStatement API as a proxy for statement cleanup
        // In the future, we should add a dedicated releaseStatement method to the native module
        this._native.releaseStatement(handle, (err) => {
          if (err) {
            this._logger.error('Error releasing statement', { statementId: handle.statementId, error: err })
          } else {
            this._logger.debug('Statement released successfully', { statementId: handle.statementId })
          }
          cb(err)
        })
      },
      callback,
      'ReleaseStatement'
    )
  }

  /**
   * Simplified query method - just creates a statement and starts execution
   */
  query (
    sql: string,
    paramsOrCallback?: SqlParameter[] | QueryUserCallback,
    callback?: QueryUserCallback
  ): any {
    // Parse parameters
    let params: any[] = []
    let cb: QueryUserCallback | undefined

    if (typeof paramsOrCallback === 'function') {
      cb = paramsOrCallback
    } else {
      cb = callback
      params = paramsOrCallback ?? []
    }

    // For query, we need a specialized implementation of executeOperation that handles

    const task: QueueTask = {
      execute: (done) => {
        this._logger.debug('Executing query', { sql, params })
        this._native.query(sql, params, (err, result) => {
          if (cb) cb(err, result)
          done()
        })
      },
      fail: (err) => {
        if (cb) cb(err)
      }
    }

    // Add promise if no callback provided
    if (!cb) {
      task.promise = new Promise<QueryResult>((resolve, reject) => {
        task.execute = (done) => {
          this._logger.debug('Executing query', { sql, params })
          this._native.query(sql, params, (err, result) => {
            if (err) reject(err)
            else resolve(result ?? {} as QueryResult)
            done()
          })
        }
        task.fail = (err) => { reject(err) }
      })
    }

    return this.enqueueTask(task)
  }
}
