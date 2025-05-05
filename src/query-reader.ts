// src/statement.ts
import { EventEmitter } from 'events'
import { Connection } from './connection'
import logger from './logger'
import { QueryResult } from './native-module'

export class QueryReader extends EventEmitter {
  constructor (public readonly connection: Connection, public readonly result: QueryResult) {
    super()
  }

  async begin () {
    const top = await this.connection.fetchRows(this.result.handle, 50)
    logger.debug(`statementId = ${this.result.handle.statementId}`)
  }
}
