// src/statement.ts
import { EventEmitter } from 'events'
import { Connection } from './connection'
import logger from './logger'
import { QueryResult, OdbcRow } from './native-module'

export enum ResultFormat {
  ARRAY = 'array', // Return rows as arrays of values
  OBJECT = 'object', // Return rows as objects with column names as keys
}

export interface QueryOptions {
  streaming?: boolean // Stream results via events or return all at once
  format?: ResultFormat // How to format each row
  camelCase?: boolean // Convert snake_case column names to camelCase
}

export class QueryReader extends EventEmitter {
  private hasStarted = false
  private isComplete = false
  private fetchError: Error | null = null
  private allRows: OdbcRow[] = [] // Only used in non-streaming mode

  constructor (
    public readonly connection: Connection,
    public readonly result: QueryResult,
    public readonly options?: QueryOptions
  ) {
    super()

    // Set default options
    this.options = this.options ?? {
      streaming: false,
      format: ResultFormat.OBJECT,
      camelCase: true
    } as QueryOptions

    // Start fetching data automatically
    this.fetchData().catch(err => {
      this.fetchError = err
      this.emit('error', err)
    })
  }

  private async fetchData (): Promise<void> {
    const batchSize = 50
    const handle = this.result.handle
    let total = 0
    this.hasStarted = true
    const isStreaming = this.options?.streaming === true

    // Emit 'begin' and 'meta' events on next tick to allow listeners to be set up
    process.nextTick(() => {
      if (isStreaming) {
        this.emit('begin')
        this.emit('meta', this.result.meta)
      }
    })

    try {
      let endOfRows = this.result.meta.length === 0 || this.result.endOfRows
      while (!endOfRows) {
        const next = await this.connection.promises.fetchRows(handle, batchSize)
        if (!next) break

        const rows = next.rows ?? []
        logger.debug(`
  statementId = ${handle.statementId}
  rows read = ${rows.length}
  requested = ${batchSize}
  end of rows = ${endOfRows}
  total = ${total}
`)

        if (isStreaming) {
          // When streaming, just emit events, don't store rows
          this.dispatch(rows)
        } else {
          // Only collect rows in memory if not streaming
          this.allRows = this.allRows.concat(rows)
        }

        endOfRows = next.endOfRows
        total += rows.length
      }

      this.isComplete = true

      // Always emit 'end' event regardless of streaming mode
      this.emit('end')

      logger.debug(`Query complete. Total rows: ${total}`)
    } catch (error: any) {
      logger.error(`Error fetching rows: ${error.message}`)
      this.fetchError = error

      // Always emit error event regardless of streaming mode
      // This ensures getAllRows() will reject the promise in either mode
      this.emit('error', error)
    }
  }

  // For non-streaming mode, wait for all rows
  async getAllRows (): Promise<OdbcRow[]> {
    if (this.options?.streaming) {
      throw new Error('Cannot use getAllRows() in streaming mode. Use event listeners instead.')
    }

    // If already complete, return the rows immediately
    if (this.isComplete) {
      return this.allRows
    }

    // If error has already occurred, reject immediately
    if (this.fetchError) {
      return Promise.reject(this.fetchError)
    }

    // Otherwise, wait for completion or error
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.removeListener('end', onComplete)
        this.removeListener('error', onError)
        reject(new Error('Timeout waiting for query to complete after 30 seconds'))
      }, 30000) // 30 second timeout

      const onComplete = () => {
        clearTimeout(timeout)
        this.removeListener('error', onError)
        resolve(this.allRows)
      }

      const onError = (err: Error) => {
        clearTimeout(timeout)
        this.removeListener('end', onComplete)
        reject(err)
      }

      this.once('end', onComplete)
      this.once('error', onError)
    })
  }

  private dispatch (rows: OdbcRow[]): void {
    const meta = this.result.meta
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      this.emit('row', row, i)
      for (let j = 0; j < meta.length; j++) {
        const name: string = meta[j].colName
        this.emit('col', j, row[name])
      }
    }
  }
}
