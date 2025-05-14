import { EventEmitter } from 'events'
import { Connection } from './connection'
import { QueryResult, OdbcRow } from './native-module'
import { QueryOptions } from './query-reader'

import logger from './logger'

export class AggregatedResult {
  meta: QueryResult[]
  rows: OdbcRow[][]
  first: OdbcRow[]
  constructor (public readonly connection: Connection) {
    this.meta = []
    this.rows = []
    this.first = []
  }
}

export class QueryAggregator extends EventEmitter {
  constructor (
    public readonly connection: Connection,
    public readonly result: QueryResult,
    public readonly options?: QueryOptions
  ) {
    super()
  }
}
