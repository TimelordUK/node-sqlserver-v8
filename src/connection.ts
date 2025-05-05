// src/connection.ts
import {
  CloseConnectionCallback,
  NativeConnection,
  OpenConnectionCallback,
  QueryResult,
  QueryUserCallback
} from './native-module'
import { EventEmitter } from 'events'
import { StatementState } from './statement'
import { AsyncQueue, QueueTask } from './async-queue'
import { ClassLogger } from './class-logger'

/**
 * Wrapper for the native Connection class that enforces operation queuing
 */

class ConnectionPromises {
  constructor(public readonly connection: Connection) {
  }

  open(connectionString: string): Promise<QueryResult> {
    return new Promise<QueryResult>((resolve, reject) => {
      this.connection.open(connectionString, (err, result) => {
        if (err) reject(err)
        else resolve(result)
      })
    })
  }

  close(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.connection.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  query(sql: string, params: any[]): Promise<QueryResult> {
    return new Promise<QueryResult>((resolve, reject) => {
      this.connection.query(sql, params, (err, result) => {
        if (err) reject(err)
        else resolve(result ?? {} as QueryResult)
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

  constructor(nativeConnection: NativeConnection) {
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
  open(connectionString: string, callback?: OpenConnectionCallback): Promise<QueryResult> | undefined {
    return this.executeOperation<QueryResult>(
      (cb) => { this._native.open(connectionString, cb) },
      callback,
      'Opening database connection',
      { connectionString }
    )
  }

  /**
   * Close the database connection
   */
  close(callback?: CloseConnectionCallback): Promise<void> | undefined {
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
   * Simplified query method - just creates a statement and starts execution
   */
  query(
    sql: string,
    paramsOrCallback?: any[] | QueryUserCallback,
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
    // the specific callback signature with rows and more parameters
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
