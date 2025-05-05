// src/statement.ts
import { EventEmitter } from 'events'
import { Connection } from './connection'
import { QueueTask } from './async-queue'
import logger from './logger'

export enum StatementState {
  INITIALIZED = 'initialized',
  EXECUTING = 'executing',
  METADATA_READY = 'metadata_ready',
  FETCHING_ROWS = 'fetching_rows',
  FETCH_COMPLETE = 'fetch_complete',
  MORE_RESULTS = 'more_results',
  COMPLETED = 'completed',
  ERROR = 'error'
}

export class Statement extends EventEmitter {
  private _statementId: number | null = null
  private _batchSize: number = 50
  private _canceled: boolean = false
  private _state: StatementState = StatementState.INITIALIZED
  private readonly _connectionId: number
  private readonly _connection: Connection
  private _hasMoreRows: boolean = false
  private _hasMoreResults: boolean = false

  constructor (connection: Connection, connectionId: number, statementId: number) {
    super()
    this._connection = connection
    this._connectionId = connectionId
    this._statementId = statementId
  }

  private _getLogContext (): Record<string, any> {
    return {
      connectionId: this._connectionId,
      statementId: this._statementId,
      state: this._state,
      batchSize: this._batchSize,
      canceled: this._canceled,
      hasMoreRows: this._hasMoreRows,
      hasMoreResults: this._hasMoreResults
    }
  }

  /**
   * Get the current state of the statement
   */
  getState (): StatementState {
    return this._state
  }

  /**
   * Set the statement ID returned by the native driver
   */
  setStatementId (id: number): void {
    this._statementId = id
    logger.debug(`Statement ID assigned: ${id}`, this._getLogContext())
  }

  /**
   * Get the statement ID
   */
  getStatementId (): number | null {
    return this._statementId
  }

  /**
   * Set batch size for fetching rows
   */
  setBatchSize (size: number): this {
    this._batchSize = size
    return this
  }

  /**
   * Get current batch size
   */
  getBatchSize (): number {
    return this._batchSize
  }

  /**
   * Execute the statement with given SQL and parameters
   */
  async execute (
    sql: string,
    params: any[] = [],
    callback?: (err: Error | null, rows?: any[], more?: boolean) => void
  ): Promise<void> {
    if (this._state !== StatementState.INITIALIZED) {
      const err = new Error(`Cannot execute statement in state: ${this._state}`)
      if (callback) callback(err)
      this.emit('error', err)
      return
    }

    // Skip this for now as it's not fully implemented
    // We'll implement this properly later
    // const queryTask: QueueTask = {
    //   execute: (done) => {},
    //   fail: (err) => {}
    // }

    this._state = StatementState.EXECUTING
    logger.debug('Executing statement', {
      ...this._getLogContext(),
      sql: sql.substring(0, 200) + (sql.length > 200 ? '...' : '')
    })

    try {
      await this._connection.enqueueTask({
        execute: (done) => {
          // Get the native connection from our connection object
          const native = (this._connection as any)._native

          native.executeQuery(sql, params, (err: Error | null, statementId?: number, metadata?: any) => {
            if (err) {
              this._state = StatementState.ERROR
              this.emit('error', err)
              if (callback) callback(err)
              done()
              return
            }

            // Store statement ID
            this.setStatementId(statementId ?? -1)
            this._state = StatementState.METADATA_READY

            // Emit metadata event
            this.emit('metadata', metadata)

            // Start fetching rows if there's metadata
            if (metadata?.columns && metadata.columns.length > 0) {
              this._hasMoreRows = true
              this.fetchBatch(callback, done)
            } else {
              this._state = StatementState.COMPLETED
              this.emit('done')
              if (callback) callback(null, [], false)
              done()
            }
          })
        },
        fail: (err) => {
          this._state = StatementState.ERROR
          this.emit('error', err)
          if (callback) callback(err)
        }
      })
    } catch (err: any) {
      this._state = StatementState.ERROR
      this.emit('error', err)
      if (callback) callback(err)
    }
  }

  /**
   * Fetch a batch of rows from the result set
   */
  async fetchBatch (
    callback?: (err: Error | null, rows?: any[], more?: boolean) => void,
    initialDone?: () => void
  ): Promise<void> {
    if (!this._statementId || !this._hasMoreRows) {
      const err = new Error('No more rows to fetch or invalid statement ID')
      if (callback) callback(err)
      if (initialDone) initialDone()
      return
    }

    this._state = StatementState.FETCHING_ROWS
    logger.debug('Fetching batch of rows', this._getLogContext())

    try {
      await this._connection.enqueueTask({
        execute: (done) => {
          // Get the native connection
          const native = (this._connection as any)._native

          native.fetchRows(this._statementId ?? -1, this._batchSize, (err: Error | null, rows?: any[], hasMore?: boolean) => {
            if (err) {
              this._state = StatementState.ERROR
              this.emit('error', err)
              if (callback) callback(err)
              if (initialDone) initialDone()
              done()
              return
            }

            // Process rows
            if (rows && rows.length > 0) {
              this.emit('batch', rows)
              rows.forEach(row => this.emit('row', row))
              if (callback) callback(null, rows, hasMore)
            }

            // Update state based on more rows
            this._hasMoreRows = !!hasMore

            if (hasMore) {
              // If this was the first batch, signal initial completion
              if (initialDone) {
                initialDone()
                initialDone = undefined
              }

              // We'll fetch the next batch on next call to fetchBatch
              done()
            } else {
              this._state = StatementState.FETCH_COMPLETE

              // Check for more result sets
              this.checkMoreResults(callback, done, initialDone)
            }
          })
        },
        fail: (err) => {
          this._state = StatementState.ERROR
          this.emit('error', err)
          if (callback) callback(err)
          if (initialDone) initialDone()
        }
      })
    } catch (err: any) {
      this._state = StatementState.ERROR
      this.emit('error', err)
      if (callback) callback(err)
      if (initialDone) initialDone()
    }
  }

  /**
   * Check for additional result sets
   */
  async checkMoreResults (
    callback?: (err: Error | null, rows?: any[], more?: boolean) => void,
    done?: () => void,
    initialDone?: () => void
  ): Promise<void> {
    this._state = StatementState.MORE_RESULTS
    logger.debug('Checking for more results', this._getLogContext())

    try {
      await this._connection.enqueueTask({
        execute: (nextDone) => {
          // Get the native connection
          const native = (this._connection as any)._native

          native.nextResultSet(this._statementId ?? -1, (err: Error | null, hasMore?: boolean, metadata?: any) => {
            if (err) {
              this._state = StatementState.ERROR
              this.emit('error', err)
              if (callback) callback(err)
              if (done) done()
              if (initialDone) initialDone()
              nextDone()
              return
            }

            this._hasMoreResults = !!hasMore

            if (hasMore && metadata) {
              // New result set available
              this._state = StatementState.METADATA_READY
              this._hasMoreRows = true

              // Emit metadata
              this.emit('metadata', metadata)

              // If this was the first result set, signal completion
              if (initialDone) {
                initialDone()
                initialDone = undefined
              }

              // Start fetching from new result set
              this.fetchBatch(callback, done)
              nextDone()
            } else {
              // All done
              this._state = StatementState.COMPLETED
              this.emit('done')
              if (callback) callback(null, [], false)
              if (done) done()
              if (initialDone) initialDone()
              nextDone()
            }
          })
        },
        fail: (err) => {
          this._state = StatementState.ERROR
          this.emit('error', err)
          if (callback) callback(err)
          if (done) done()
          if (initialDone) initialDone()
        }
      })
    } catch (err: any) {
      this._state = StatementState.ERROR
      this.emit('error', err)
      if (callback) callback(err)
      if (done) done()
      if (initialDone) initialDone()
    }
  }

  /**
   * Cancel the current query
   */
  async cancel (callback?: (err: Error | null) => void): Promise<void> {
    if (!this._statementId || this._canceled) {
      if (callback) callback(null)
      return
    }

    this._canceled = true
    logger.debug('Canceling statement', this._getLogContext())

    try {
      await this._connection.enqueueTask({
        execute: (done) => {
          // Get the native connection
          const native = (this._connection as any)._native

          native.cancelStatement(this._statementId ?? -1, (err: Error | null) => {
            if (err) {
              this.emit('error', err)
              if (callback) callback(err)
            } else {
              this.emit('canceled')
              if (callback) callback(null)
            }
            done()
          })
        },
        fail: (err) => {
          this.emit('error', err)
          if (callback) callback(err)
        }
      })
    } catch (err: any) {
      this.emit('error', err)
      if (callback) callback(err)
    }
  }

  /**
   * Check if the statement has been canceled
   */
  isCanceled (): boolean {
    return this._canceled
  }

  /**
   * Check if the statement has more rows in the current result set
   */
  hasMoreRows (): boolean {
    return this._hasMoreRows
  }

  /**
   * Check if the statement has more result sets
   */
  hasMoreResults (): boolean {
    return this._hasMoreResults
  }
}
