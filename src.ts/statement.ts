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
   *
   * @param sql The SQL query to execute
   * @param params Optional parameters for the query
   * @param callback Optional callback for backward compatibility
   * @returns A Promise that resolves when the statement has finished executing (including fetching initial rows)
   */
  async execute (
    sql: string,
    params: any[] = [],
    callback?: (err: Error | null, rows?: any[], more?: boolean) => void
  ): Promise<{ metadata: any, rows: any[] }> {
    if (this._state !== StatementState.INITIALIZED) {
      const err = new Error(`Cannot execute statement in state: ${this._state}`)
      if (callback) callback(err)
      this.emit('error', err)
      return Promise.reject(err)
    }

    this._state = StatementState.EXECUTING
    logger.debug('Executing statement', {
      ...this._getLogContext(),
      sql: sql.substring(0, 200) + (sql.length > 200 ? '...' : '')
    })

    // Create a Promise to handle the entire operation
    return new Promise((resolve, reject) => {
      let metadataResult: any = null
      let firstBatchRows: any[] = []

      try {
        this._connection.enqueueTask({
          execute: (done) => {
            // Get the native connection from our connection object
            const native = (this._connection as any)._native

            native.executeQuery(sql, params, (err: Error | null, statementId?: number, metadata?: any) => {
              if (err) {
                this._state = StatementState.ERROR
                this.emit('error', err)
                if (callback) callback(err)
                reject(err)
                done()
                return
              }

              // Store the metadata for later return
              metadataResult = metadata || {}

              // Store statement ID
              this.setStatementId(statementId ?? -1)
              this._state = StatementState.METADATA_READY

              // Emit metadata event
              this.emit('metadata', metadata)

              // Start fetching rows if there's metadata
              if (metadata?.columns && metadata.columns.length > 0) {
                this._hasMoreRows = true

                // Create a one-time batch callback to capture the first batch
                const batchCallback = (batchErr: Error | null, rows?: any[], more?: boolean) => {
                  if (batchErr) {
                    // Report error to original callback if provided
                    if (callback) callback(batchErr)
                    reject(batchErr)
                    return
                  }

                  // Store the rows for the promise result
                  firstBatchRows = rows ?? []

                  // Call the original callback if provided
                  if (callback) callback(null, rows, more)

                  // Resolve the main promise with both metadata and the first batch of rows
                  resolve({
                    metadata: metadataResult,
                    rows: firstBatchRows
                  })
                }

                // Fetch the first batch of rows
                this.fetchBatch(batchCallback, done)
              } else {
                // No rows to fetch
                this._state = StatementState.COMPLETED
                this.emit('done')
                if (callback) callback(null, [], false)

                // Resolve with metadata but no rows
                resolve({
                  metadata: metadataResult,
                  rows: []
                })

                done()
              }
            })
          },
          fail: (err) => {
            this._state = StatementState.ERROR
            this.emit('error', err)
            if (callback) callback(err)
            reject(err)
          }
        }).catch(err => {
          this._state = StatementState.ERROR
          this.emit('error', err)
          if (callback) callback(err)
          reject(err)
        })
      } catch (err: any) {
        this._state = StatementState.ERROR
        this.emit('error', err)
        if (callback) callback(err)
        reject(err)
      }
    })
  }

  /**
   * Fetch a batch of rows from the result set
   *
   * @param callback Optional callback for backward compatibility
   * @param initialDone Optional callback for internal use to signal completion of the first batch
   * @returns A Promise that resolves with the fetched rows and a flag indicating if more rows are available
   */
  async fetchBatch (
    callback?: (err: Error | null, rows?: any[], more?: boolean) => void,
    initialDone?: () => void
  ): Promise<{ rows: any[], hasMore: boolean }> {
    if (!this._statementId || !this._hasMoreRows) {
      const err = new Error('No more rows to fetch or invalid statement ID')
      if (callback) callback(err)
      if (initialDone) initialDone()
      return Promise.reject(err)
    }

    this._state = StatementState.FETCHING_ROWS
    logger.debug('Fetching batch of rows', this._getLogContext())

    return new Promise((resolve, reject) => {
      try {
        this._connection.enqueueTask({
          execute: (done) => {
            // Get the native connection
            const native = (this._connection as any)._native

            native.fetchRows(this._statementId ?? -1, this._batchSize, (err: Error | null, rows?: any[], hasMore?: boolean) => {
              if (err) {
                this._state = StatementState.ERROR
                this.emit('error', err)
                if (callback) callback(err)
                if (initialDone) initialDone()
                reject(err)
                done()
                return
              }

              const fetchedRows = rows ??
                []
              const moreRows = !!hasMore

              // Process rows
              if (fetchedRows.length > 0) {
                this.emit('batch', fetchedRows)
                fetchedRows.forEach(row => this.emit('row', row))

                // Call legacy callback if provided
                if (callback) callback(null, fetchedRows, moreRows)
              } else if (callback) {
                // Still call the callback with empty rows if provided
                callback(null, [], moreRows)
              }

              // Update state based on more rows
              this._hasMoreRows = moreRows

              if (moreRows) {
                // If this was the first batch, signal initial completion
                if (initialDone) {
                  initialDone()
                  initialDone = undefined
                }

                // Resolve the promise with the rows and moreRows flag
                resolve({ rows: fetchedRows, hasMore: true })

                // We'll fetch the next batch on next call to fetchBatch
                done()
              } else {
                this._state = StatementState.FETCH_COMPLETE

                // For Promise-based API, we need to handle more result sets differently
                // Since the Promise can only resolve once, we'll resolve here with the current rows
                // and the consumer can check for more result sets separately
                resolve({ rows: fetchedRows, hasMore: false })

                // For callback-based API, we'll continue with the checkMoreResults pattern
                if (callback) {
                  this.checkMoreResults(callback, done, initialDone)
                    .catch(nextErr => {
                      // We've already resolved the Promise, so we just need to handle the error for the callback API
                      if (callback) callback(nextErr)
                      if (initialDone) initialDone()
                      done()
                    })
                } else {
                  done()
                }
              }
            })
          },
          fail: (err) => {
            this._state = StatementState.ERROR
            this.emit('error', err)
            if (callback) callback(err)
            if (initialDone) initialDone()
            reject(err)
          }
        }).catch(err => {
          this._state = StatementState.ERROR
          this.emit('error', err)
          if (callback) callback(err)
          if (initialDone) initialDone()
          reject(err)
        })
      } catch (err: any) {
        this._state = StatementState.ERROR
        this.emit('error', err)
        if (callback) callback(err)
        if (initialDone) initialDone()
        reject(err)
      }
    })
  }

  /**
   * Check for additional result sets
   *
   * @param callback Optional callback for backward compatibility
   * @param done Optional callback for internal use to signal completion of the operation
   * @param initialDone Optional callback for internal use to signal completion of the first check
   * @returns A Promise that resolves with information about the next result set if available
   */
  async checkMoreResults (
    callback?: (err: Error | null, rows?: any[], more?: boolean) => void,
    done?: () => void,
    initialDone?: () => void
  ): Promise<{ hasMore: boolean, metadata?: any }> {
    this._state = StatementState.MORE_RESULTS
    logger.debug('Checking for more results', this._getLogContext())

    return new Promise((resolve, reject) => {
      try {
        this._connection.enqueueTask({
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
                reject(err)
                nextDone()
                return
              }

              this._hasMoreResults = !!hasMore

              if (hasMore && metadata) {
                // New result set available
                this._state = StatementState.METADATA_READY
                this._hasMoreRows = true

                // Emit metadata event
                this.emit('metadata', metadata)

                // If this was the first result set, signal completion
                if (initialDone) {
                  initialDone()
                  initialDone = undefined
                }

                // For Promise API, resolve with the metadata
                resolve({ hasMore: true, metadata })

                // For callback API, continue with fetching rows
                if (callback) {
                  this.fetchBatch(callback, done)
                    .catch(fetchErr => {
                      // We've already resolved the Promise, so just handle the callback error
                      if (callback) callback(fetchErr)
                    })
                }

                nextDone()
              } else {
                // All done
                this._state = StatementState.COMPLETED
                this.emit('done')

                if (callback) callback(null, [], false)
                if (done) done()
                if (initialDone) initialDone()

                resolve({ hasMore: false })
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
            reject(err)
          }
        }).catch(err => {
          this._state = StatementState.ERROR
          this.emit('error', err)
          if (callback) callback(err)
          if (done) done()
          if (initialDone) initialDone()
          reject(err)
        })
      } catch (err: any) {
        this._state = StatementState.ERROR
        this.emit('error', err)
        if (callback) callback(err)
        if (done) done()
        if (initialDone) initialDone()
        reject(err)
      }
    })
  }

  /**
   * Cancel the current query
   *
   * @param callback Optional callback for backward compatibility
   * @returns A Promise that resolves when the statement has been canceled
   */
  async cancel (callback?: (err: Error | null) => void): Promise<void> {
    if (!this._statementId || this._canceled) {
      if (callback) callback(null)
      return Promise.resolve()
    }

    this._canceled = true
    logger.debug('Canceling statement', this._getLogContext())

    return new Promise<void>((resolve, reject) => {
      try {
        this._connection.enqueueTask({
          execute: (done) => {
            // Get the native connection
            const native = (this._connection as any)._native

            native.cancelStatement(this._statementId ?? -1, (err: Error | null) => {
              if (err) {
                this.emit('error', err)
                if (callback) callback(err)
                reject(err)
              } else {
                this.emit('canceled')
                if (callback) callback(null)
                resolve()
              }
              done()
            })
          },
          fail: (err) => {
            this.emit('error', err)
            if (callback) callback(err)
            reject(err)
          }
        }).catch(err => {
          this.emit('error', err)
          if (callback) callback(err)
          reject(err)
        })
      } catch (err: any) {
        this.emit('error', err)
        if (callback) callback(err)
        reject(err)
      }
    })
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
