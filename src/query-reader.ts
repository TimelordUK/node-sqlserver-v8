// src/statement.ts
import { EventEmitter } from 'events'
import { Connection } from './connection'
import logger from './logger'
import { QueryResult, OdbcRow, ColumnDefinition } from './native-module'

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
  constructor (public readonly connection: Connection, public readonly result: QueryResult, public readonly options?: QueryOptions) {
    super()
  }

  async begin () {
    const batchSize = 50
    let total = 0
    let allRows: OdbcRow[] = [] // If you need to collect all rows
    const options = this.options ?? {
      streaming: false,
      format: ResultFormat.OBJECT,
      camelCase: true
    } as QueryOptions ?? {}

    if (options.streaming) this.emit('begin')
    if (options.streaming) this.emit('meta', this.result.meta)

    try {
      let endOfRows = false
      while (!endOfRows) {
        const next = await this.connection.fetchRows(this.result.handle, batchSize)
        if (!next) break
        const rows = next.rows ?? []
        logger.debug(`
  statementId = ${this.result.handle.statementId}
  rows read = ${rows.length}
  requested = ${batchSize}
  end of rows = ${endOfRows}
  total = ${total}
`)
        if (options.streaming) {
          this.dispatch(rows)
        }

        endOfRows = next.endOfRows
        total += rows.length
        allRows = allRows.concat(rows) // If collecting all rows
      }

      if (options.streaming) this.emit('end')
      logger.debug(`Query complete. Total rows: ${total}`)
      return allRows // If you need to return all rows
    } catch (error: any) {
      logger.error(`Error fetching rows: ${error.message}`)
      throw error
    }
  }

  private dispatch (rows: OdbcRow[]) {
    const meta = this.result.meta
    for (let i = 0; i++; i < rows.length) {
      const row = rows[i]
      this.emit('row', i)
      for (let j = 0; j++; j < meta.length) {
        const name: string = meta[j].colName
        this.emit('col', j, row[name])
      }
    }
  }
}
