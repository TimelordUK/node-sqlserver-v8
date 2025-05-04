// src/connection.ts
import { NativeConnection } from './native-module'
import { Statement } from './statement'
import { EventEmitter } from 'events'
import logger from './logger'
import { AsyncQueue, QueueTask } from './queue'

/**
 * Wrapper for the native Connection class that enforces operation queuing
 */
export class Connection extends EventEmitter {
  private readonly _native: NativeConnection
  private readonly _queue: AsyncQueue = new AsyncQueue()
  private _closed = false
  public promises: any // Type will be defined by createConnectionPromises
  public readonly _connectionId = 1

  constructor (nativeConnection: NativeConnection) {
    super()
    this._native = nativeConnection
    // Create the promise-based API
    this.promises = {
      open: this._native.open,
      close: this._native.close
    }
  }

  QueryResult = {

  }


  async promisedOpen (connectionString: string): Promise<QueryResult> {
    this._native.open(connectionString, (err, conn) => {
      if (callback) callback(err, conn)
      done()
    })
  },


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
  open (connectionString: string, callback?: (err: Error | null, conn?: any) => void): Promise<any> | undefined {
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

    return this.enqueueTask(task)
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
  ): Statement {
    // Parse parameters
    let params: any[] = []
    let cb: ((err: Error | null, rows?: any[], more?: boolean) => void) | undefined

    if (typeof paramsOrCallback === 'function') {
      cb = paramsOrCallback
    } else {
      cb = callback
      params = paramsOrCallback ?? []
    }

    logger.debug('Executing query', {
      ...this._getLogContext(),
      sql: sql.substring(0, 200) + (sql.length > 200 ? '...' : ''),
      paramCount: params.length
    })

    // Create a Statement object and start execution
    const statement = new Statement(this, this._connectionId, rows.statementId)
    void statement.execute(sql, params, cb)

    return statement
  }
}
