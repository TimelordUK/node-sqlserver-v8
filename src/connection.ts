// src/connection.ts
import { NativeConnection } from './native-module'
import { EventEmitter } from 'events'
import { Logger } from './logger'
import {StatementState} from "./statement";

/**
 * Wrapper for the native Connection class that enforces operation queuing
 */

/**
 * Task to be executed in the connection queue
 */
export interface QueueTask {
  execute: (done: () => void) => void
  fail: (err: Error) => void
  promise?: Promise<any>
}

export class AsyncQueue {
  private readonly _queue: QueueTask[] = []
  private _busy = false
  private _closed = false

  stop () {
    this._closed = true
  }

  size (): number {
    return this._queue.length
  }

  /**
   * Allows statements to enqueue tasks on this connection
   * This maintains the single-threaded queue while moving logic to Statement
   */
  async enqueueTask<T>(task: QueueTask): Promise<T> {
    return this._enqueue<T>(task)
  }

  /**
   * Execute the next task in the queue if not busy
   */
  private _executeNext (): void {
    if (this._queue.length === 0 || this._busy || this._closed) {
      return
    }

    this._busy = true
    const task = this._queue[0]

    try {
      task.execute(() => {
        this._queue.shift() // Remove the completed task
        this._busy = false
        this._executeNext() // Check for more tasks
      })
    } catch (err: any) {
      // Handle unexpected errors
      task.fail(err)
      this._queue.shift()
      this._busy = false
      this._executeNext()
    }
  }

  /**
   * Add a task to the execution queue
   */

  private async _enqueue<T>(task: QueueTask): Promise<T> {
    if (this._closed) {
      const err = new Error('Connection is closed')
      task.fail(err)
      return Promise.reject(err)
    }

    // Create a promise if not already defined
    if (!task.promise) {
      task.promise = new Promise<T>((resolve, reject) => {
        const originalExecute = task.execute
        const originalFail = task.fail

        // Override execute to resolve the promise
        task.execute = (done) => {
          originalExecute(() => {
            resolve(undefined as any)
            done()
          })
        }

        // Override fail to reject the promise
        task.fail = (err) => {
          originalFail(err)
          reject(err)
        }
      })
    }

    this._queue.push(task)
    this._executeNext()
    return task.promise as Promise<T>
  }
}

class QueryResult {
}

export class Connection extends EventEmitter {
  private readonly _native: NativeConnection
  private readonly _queue: AsyncQueue = new AsyncQueue()
  private _closed = false
  public readonly _connectionId = 1

  constructor (nativeConnection: NativeConnection) {
    super()
    this._native = nativeConnection
    // Create the promise-based API
  }

  /**
   * Allows statements to enqueue tasks on this connection
   * This maintains the single-threaded queue while moving logic to Statement
   */
  async enqueueTask<T>(task: QueueTask): Promise<T> {
    return this._queue.enqueueTask(task)
  }

  private _getLogContext (): Record<string, any> {
    return {
      connectionId: this._connectionId
    }
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
