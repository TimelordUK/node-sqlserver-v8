import { OdbcRow, OdbcScalarValue, QueryOptions, QueryResult } from './native-module'
import { Connection, SqlParameter } from '.'

export class AggregatorResults {
  public beginAt: Date
  public submittedAt: Date | null
  public endAt: Date | null
  public elapsed: number
  public first: QueryResult['rows'] | null
  public firstMeta: QueryResult['meta'] | null
  public meta: Array<QueryResult['meta']>
  public metaElapsed: number[]
  public counts: number[]
  public results: Array<QueryResult['rows'] | null>
  public output: OdbcScalarValue[] | null
  public info: string[] | null
  public errors: Error[]
  public sql: string | null
  public rowRate: number
  public rows: number
  public returns: OdbcScalarValue | null
  public row: OdbcRow

  constructor (public options: AggregatorOptions) {
    this.beginAt = new Date()
    this.submittedAt = null
    this.endAt = null
    this.elapsed = 0
    this.first = null
    this.firstMeta = null
    this.meta = []
    this.metaElapsed = []
    this.counts = []
    this.results = []
    this.output = null
    this.info = null
    this.errors = []
    this.options = options
    this.rows = 0
    this.row = []
    this.rowRate = 0
    this.sql = null

    this.returns = null
  }

  onMeta (meta: QueryResult['meta']) {
    for (let i = 0; i < meta.length; ++i) {
      if (this.options.replaceEmptyColumnNames) {
        if (!meta[i].name || meta[i].name.length === 0) {
          meta[i].name = `Column${i}`
        }
      }
    }
    this.calcElapsed()
    this.meta.push(meta)
    this.results.push([])
    this.metaElapsed.push(this.elapsed)
    if (this.first === null) {
      this.first = this.results[0]
      this.firstMeta = meta
    }
  }

  onOutput (o: OdbcScalarValue[]) {
    this.output = this.output ?? []
    this.output = o
    if (o.length > 0) {
      this.returns = o[0]
    }
  }

  onSubmitted (q) {
    this.calcElapsed()
    this.submittedAt = new Date()
    this.sql = q.query_str
  }

  onRowCount (count: number) {
    this.counts.push(count)
  }

  end () {
    this.endAt = new Date()
  }

  onRow () {
    this.rows++
    if (this.options.raw) {
      this.row = []
    } else {
      this.row = {}
    }
    this.calcElapsed()
    this.rowRate = (this.rows / this.elapsed) * 1000
  }

  onInfo (m: Error) {
    this.info = this.info ?? []
    this.info.push(m.message.substring(m.message.lastIndexOf(']') + 1))
  }

  calcElapsed () {
    this.elapsed = new Date() - this.beginAt
  }

  onDone () {
    this.calcElapsed()
  }

  lastError () {
    return this.errors.length > 0
      ? this.errors[this.errors.length - 1]
      : null
  }

  resultId () {
    return this.meta.length - 1
  }

  newRow () {
    const resultId = this.resultId()
    return this.options.raw ? [this.meta[resultId].length] : {}
  }

  onColumn (c: number, v: OdbcScalarValue) {
    const resultId = this.resultId()
    const meta = this.meta[resultId]
    this.results = this.results ?? []
    this.results[resultId] = []
    const results = this.results[resultId]

    if (this.options.raw) {
      const row = this.row as OdbcScalarValue[]
      row[c] = v
    } else {
      const row = this.row as Record<string, OdbcScalarValue>
      row[meta[c].name] = v
    }
    if (c === meta.length - 1) {
      results.push(this.row)
    }
  }
}

class AggregatorOptions {
  public readonly raw: boolean
  public readonly timeoutMs: number
  public readonly replaceEmptyColumnNames: boolean
  constructor (options: QueryOptions) {
    this.timeoutMs = this.getOpt(options, 'timeoutMs', 0)
    this.raw = this.getOpt(options, 'raw', false)
    this.replaceEmptyColumnNames = this.getOpt(options, 'replaceEmptyColumnNames', false)
  }

  getOpt (src: Record<string, any>, p: string, def: any) {
    if (!src) {
      return def
    }
    let ret
    if (Object.hasOwnProperty.call(src, p)) {
      ret = src[p]
    } else {
      ret = def
    }
    return ret
  }
}

export class QueryAggregator {
  constructor (private readonly connectionProxy: Connection) {
  }

  emptyResults (options: AggregatorOptions) {
    return new AggregatorResults(options)
  }

  async run (q, opt) {
    return new Promise((resolve, reject) => {
      if (this.connectionProxy.isClosed()) {
        reject(new Error('connection is closed.'))
      }
      let handle: NodeJS.Timeout

      const options = new AggregatorOptions(opt)
      const ret = this.emptyResults(options)

      if (options.timeoutMs) {
        handle = this.timeOut(q, options.timeoutMs, (e: Error) => {
          if (e) {
            ret.errors.push(e)
          }
        })
      }

      function onSubmitted (q) {
        ret.onSubmitted(q)
      }

      function onRowCount (count: number) {
        ret.onRowCount(count)
      }

      function onOutput (o: OdbcScalarValue[]) {
        ret.onOutput(o)
      }

      function onError (e: Error, more: boolean) {
        ret.errors.push(e)
      }

      function onInfo (m: Error) {
        ret.onInfo(m)
      }

      function onMeta (meta: QueryResult['meta']) {
        ret.onMeta(meta)
      }

      function onRow () {
        ret.onRow()
      }

      function rejectResolve () {
        ret.end()
        const last = ret.lastError()
        if (last) {
          reject(last)
        } else {
          resolve(ret)
        }
      }

      function onDone () {
        if (handle) {
          clearTimeout(handle)
        }
        unSubscribe()
        ret.onDone()
        // these will not be free at this point as the
        // statement can be used over and over again until
        // manually free
        if (q.isPrepared()) {
          rejectResolve()
        }
      }

      function onFree () {
        q.off('free', onFree)
        rejectResolve()
      }

      function onColumn (c: number, v: OdbcScalarValue) {
        ret.onColumn(c, v)
      }

      function unSubscribe () {
        q.off('submitted', onSubmitted)
        q.off('rowcount', onRowCount)
        q.off('column', onColumn)
        q.off('output', onOutput)
        q.off('error', onError)
        q.off('info', onInfo)
        q.off('meta', onMeta)
        q.off('row', onRow)
        q.off('done', onDone)
        if (q.isPrepared()) {
          q.off('free', onFree)
        }
      }

      function subscribe () {
        q.on('submitted', onSubmitted)
        q.on('rowcount', onRowCount)
        q.on('output', onOutput)
        q.on('error', onError)
        q.on('info', onInfo)
        q.on('meta', onMeta)
        q.on('row', onRow)
        q.on('done', onDone)
        q.on('free', onFree)
        q.on('column', onColumn)
      }

      subscribe()
    })
  }

  timeOut (q, timeoutMs: number, reject): NodeJS.Timeout {
    return setTimeout(() => {
      try {
        q.pauseQuery()
        q.cancelQuery((e: Error) => {
          e = e || new Error(`Query cancelled timeout ${timeoutMs}`)
          reject(e)
        })
      } catch (e) {
        reject(e)
      }
    }, timeoutMs)
  }

  async query (sql: string, params: SqlParameter[], options: QueryOptions) {
    const q = this.connectionProxy.query(sql, params)
    return this.run(q, options)
  }
}

exports.QueryAggregator = QueryAggregator
