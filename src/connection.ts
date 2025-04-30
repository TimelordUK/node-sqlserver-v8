// src/connection.ts
import { NativeConnection, NativeQuery } from './native-module'
import { createConnectionPromises } from './connection-promises'

/**
 * Task to be executed in the connection queue
 */
interface QueueTask {
  execute: (done: () => void) => void
  fail: (err: Error) => void
  promise?: Promise<any>
}

/**
 * Wrapper for the native Connection class that enforces operation queuing
 */
export class Connection {
  private readonly _native: NativeConnection
  private readonly _queue: QueueTask[] = []
  private _busy = false
  public promises: any // Type will be defined by createConnectionPromises

  constructor (nativeConnection: NativeConnection) {
    this._native = nativeConnection
    // Create the promise-based API
    this.promises = createConnectionPromises(this)
  }

  /**
   * Execute the next task in the queue if not busy
   */
  private _executeNext (): void {
    if (this._queue.length === 0 || this._busy) {
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
  private _enqueue (task: QueueTask): Promise<any> | undefined {
    this._queue.push(task)
    this._executeNext()
    return task.promise // If using promises
  }

  /**
   * Open a connection to the database
   */
  open (connectionString: string, callback?: (err: Error | null, conn?: any) => void): Promise<any> | undefined {
    return this._enqueue({
      execute: (done) => {
        this._native.open(connectionString, (err, conn) => {
          if (callback) callback(err, conn)
          done()
        })
      },
      fail: (err) => {
        if (callback) callback(err)
      }
    })
  }

  /**
   * Close the database connection
   */
  close (callback?: (err: Error | null) => void): Promise<any> | undefined {
    return this._enqueue({
      execute: (done) => {
        this._native.close((err) => {
          if (callback) callback(err)
          done()
        })
      },
      fail: (err) => {
        if (callback) callback(err)
      }
    })
  }

  /**
   * Execute a SQL query
   */
  query (
    sql: string,
    paramsOrCallback?: any[] | ((err: Error | null, rows?: any[], more?: boolean) => void),
    callback?: (err: Error | null, rows?: any[], more?: boolean) => void
  ): any {
    let params: any[] = []
    let cb: ((err: Error | null, rows?: any[], more?: boolean) => void) | undefined

    if (typeof paramsOrCallback === 'function') {
      cb = paramsOrCallback
    } else {
      cb = callback
      params = paramsOrCallback ?? []
    }

    const queryObj: { nativeQuery?: NativeQuery } = {}

    this._enqueue({
      execute: (done) => {
        const nativeQuery = this._native.query(sql, params, (err, rows, more) => {
          if (cb) cb(err, rows, more)
          if (!more) done()
        })

        // Store reference to the native query object
        queryObj.nativeQuery = nativeQuery
      },
      fail: (err) => {
        if (cb) cb(err)
      }
    })

    // Return an object with methods that operate on the underlying native query
    return {
      on: (event: string, handler: Function): Connection => {
        if (queryObj.nativeQuery) {
          queryObj.nativeQuery.on(event, handler)
        }
        return this
      },
      cancelQuery: (cb?: Function): Connection => {
        if (queryObj.nativeQuery) {
          queryObj.nativeQuery.cancelQuery(cb)
        }
        return this
      }
      // ... other query methods
    }
  }

  // Other methods would be implemented similarly
}
