// src/connection.ts
import { NativeConnection } from './native-module'
import { EventEmitter } from 'events'
import { Logger, LogLevel } from './logger' // Corrected import
import { StatementState } from './statement'
import { AsyncQueue, QueueTask } from './async-queue'
import { ClassLogger } from './class-logger'

/**
 * Wrapper for the native Connection class that enforces operation queuing
 */

class QueryResult {
}

export class Connection extends EventEmitter {
  private readonly _native: NativeConnection
  private readonly _queue: AsyncQueue = new AsyncQueue()
  private _closed = false
  public readonly _connectionId = 1
  private readonly _logger: ClassLogger

  constructor (nativeConnection: NativeConnection) {
    super()
    this._native = nativeConnection
    this._logger = new ClassLogger('Connection', { connectionId: this._connectionId })
    this._logger.debug('Connection ctor')
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
  open (connectionString: string, callback?: (err: Error | null, conn?: any) => void): Promise<QueryResult> | undefined {
    const that = this
    const task: QueueTask = {
      execute: (done) => {
        this._native.open(connectionString, (err, conn) => {
          if (callback) callback(err, conn)
          done()
        })
      },
      fail: (err) => {
        if (callback) callback(err)
      }
    }

    // Add promise if no callback provided
    if (!callback) {
      task.promise = new Promise((resolve, reject) => {
        task.execute = (done) => {
          this._logger.debug('Opening database connection', { connectionString })
          this._native.open(connectionString, (err, conn) => {
            if (err) reject(err)
            else resolve(conn)
            done()
          })
        }
        task.fail = (err) => { reject(err) }
      })
    }

    return that.enqueueTask(task)
  }

  /**
   * Close the database connection
   */
  close (callback?: (err: Error | null) => void): Promise<void> | undefined {
    const task: QueueTask = {
      execute: (done) => {
        this._native.close((err) => {
          this._closed = true
          if (callback) callback(err)
          done()
        })
      },
      fail: (err) => {
        if (callback) callback(err)
      }
    }

    // Add promise if no callback provided
    if (!callback) {
      task.promise = new Promise<void>((resolve, reject) => {
        task.execute = (done) => {
          this._native.close((err) => {
            this._closed = true
            if (err) reject(err)
            else resolve()
            done()
          })
        }
        task.fail = (err) => { reject(err) }
      })
    }

    return this.enqueueTask(task)
  }

  /**
   * Simplified query method - just creates a statement and starts execution
   */
  query (
    sql: string,
    paramsOrCallback?: any[] | ((err: Error | null, rows?: any[], more?: boolean) => void),
    callback?: (err: Error | null, rows?: any[], more?: boolean) => void
  ): any {
    // Parse parameters
    let params: any[] = []
    let cb: ((err: Error | null, rows?: any[], more?: boolean) => void) | undefined

    if (typeof paramsOrCallback === 'function') {
      cb = paramsOrCallback
    } else {
      cb = callback
      params = paramsOrCallback ?? []
    }

    const task: QueueTask = {
      execute: (done) => {
        // Get the native connection from our connection object
        const native = this._native
        native.query(sql, params, (err: Error | null, metadata?: QueryResult) => {
          if (err) {
            if (callback) callback(err)
            done()
          }
        })
      },
      fail: (err) => {
        if (callback) callback(err)
      }
    }

    if (!callback) {
      task.promise = new Promise((resolve, reject) => {
        task.execute = (done) => {
          this._native.query(sql, params, (err: Error | null, metadata?: QueryResult) => {
            if (err) reject(err)
            else resolve(metadata)
            done()
          })
        }
        task.fail = (err) => { reject(err) }
      })
    }
    // Add promise if no callback provided

    return this.enqueueTask(task)
  }
}
