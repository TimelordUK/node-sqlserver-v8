const { logger } = require('./logger')

// A driver prefixes every diagnostic with its component chain, e.g.
// "[Microsoft][ODBC Driver 18 for SQL Server][SQL Server]", and only that chain should come
// off. Matching the components we know keeps a message that opens with a bracket of its own
// intact, which is what "print 'select * from [dbo].[t]'" needs.
const knownDriverPrefix = /^(?:\[(?:Microsoft|unixODBC|iODBC|ODBC Driver Manager|ODBC Driver \d+ for SQL Server|SQL Server Native Client[^\]]*|SQL Native Client[^\]]*|SQL Server)\])+/i

// Any other driver still gets its leading component chain removed. A message of its own that
// opens with a bracket is the one case that cannot be told apart from a component, and
// losing a leading group beats losing the whole line.
const leadingBracketGroups = /^(?:\[[^\]]*\])+/

// Cutting at the last ']' in the whole string, as this used to, destroyed any message
// holding a bracket of its own: "print 'select * from [dbo].[my_table]'" arrived as "" and
// "print 'ends with ]'" arrived as "", which is exactly the generated SQL people PRINT.
function stripDriverPrefix (message) {
  if (typeof message !== 'string') {
    return message
  }
  const known = knownDriverPrefix.exec(message)
  if (known !== null) {
    return message.substring(known[0].length)
  }
  const any = leadingBracketGroups.exec(message)
  return any !== null ? message.substring(any[0].length) : message
}

class AggregatorResults {
  constructor (options) {
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
    this.states = []
    this.info = null
    this.errors = []
    this.options = options
    this.rows = 0
    this.row = null
    this.rowRate = 0
    this.sql = null

    this.returns = null
  }

  onMeta (meta) {
    for (let i = 0; i < meta.length; ++i) {
      if (this.options.replaceEmptyColumnNames) {
        if (!meta[i].name || meta[i].length === 0) {
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

  onOutput (o) {
    this.output = o
    if (o && Array.isArray(o) && o.length > 0) {
      this.returns = o[0]
    }
  }

  onStateChange (ev) {
    this.states.push(ev)
  }

  onSubmitted (q) {
    this.calcElapsed()
    this.submittedAt = new Date()
    this.sql = q.query_str
  }

  onRowCount (count) {
    this.counts.push(count)
  }

  end () {
    this.endAt = new Date()
  }

  onRow () {
    this.rows++
    this.row = this.newRow()
    this.calcElapsed()
    this.rowRate = (this.rows / this.elapsed) * 1000
  }

  onInfo (m) {
    if (!this.info) {
      this.info = []
    }
    this.info.push(stripDriverPrefix(m.message))
  }

  calcElapsed () {
    this.elapsed = new Date() - this.beginAt
  }

  onDone () {
    this.calcElapsed()
    this.row = null
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

  onColumn (c, v) {
    const resultId = this.resultId()
    const meta = this.meta[resultId]
    const results = this.results[resultId]
    const row = this.row

    if (this.options.raw) {
      row[c] = v
    } else {
      row[meta[c].name] = v
    }
    if (c === meta.length - 1) {
      results.push(row)
    }
  }
}

class AggregatorOptions {
  constructor (options) {
    this.timeoutMs = this.getOpt(options, 'timeoutMs', 0)
    this.raw = this.getOpt(options, 'raw', false)
    this.replaceEmptyColumnNames = this.getOpt(options, 'replaceEmptyColumnNames', false)
  }

  getOpt (src, p, def) {
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

class QueryAggregator {
  constructor (connectionProxy) {
    this.connectionProxy = connectionProxy
  }

  emptyResults (options) {
    return new AggregatorResults(options)
  }

  async run (q, opt) {
    return new Promise((resolve, reject) => {
      if (this.connectionProxy.isClosed()) {
        reject(new Error('connection is closed.'))
      }
      let handle = null

      const options = new AggregatorOptions(opt)
      const ret = this.emptyResults(options)

      if (options.timeoutMs) {
        handle = this.timeOut(q, options.timeoutMs, (e) => {
          if (e) {
            ret.errors.push(e)
          }
        })
      }

      function onSubmitted (q) {
        ret.onSubmitted(q)
      }

      function onRowCount (count) {
        ret.onRowCount(count)
      }

      function onStateChange (ev) {
        ret.onStateChange(ev)
      }

      function onOutput (o) {
        ret.onOutput(o)
      }

      function onError (e, more) {
        logger.debugLazy(() => `onError ${e?.message}`)
        ret.errors.push(e)
        if (!more) {
          e._results = ret
        }
      }

      function onInfo (m) {
        logger.debugLazy(() => `onInfo ${m?.message}`)
        ret.onInfo(m)
      }

      function onMeta (meta) {
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
        logger.debugLazy(() => 'onDone')
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
        q.removeListener('free', onFree)
        rejectResolve()
      }

      function onColumn (c, v) {
        ret.onColumn(c, v)
      }

      function unSubscribe () {
        q.removeListener('submitted', onSubmitted)
        q.removeListener('rowcount', onRowCount)
        q.removeListener('stateChange', onStateChange)
        q.removeListener('column', onColumn)
        q.removeListener('output', onOutput)
        q.removeListener('error', onError)
        q.removeListener('info', onInfo)
        q.removeListener('meta', onMeta)
        q.removeListener('row', onRow)
        q.removeListener('done', onDone)
        if (q.isPrepared()) {
          q.removeListener('free', onFree)
        }
      }

      function subscribe () {
        q.on('submitted', onSubmitted)
        q.on('rowcount', onRowCount)
        q.on('stateChange', onStateChange)
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

  timeOut (q, timeoutMs, reject) {
    return setTimeout(() => {
      try {
        logger.debugLazy(() => `timeoutMs ${timeoutMs}ms - cancel query`)
        q.pauseQuery()
        q.cancelQuery((e) => {
          e = e || new Error(`Query cancelled timeout ${timeoutMs}`)
          reject(e)
        })
      } catch (e) {
        reject(e)
      }
    }, timeoutMs)
  }

  async callProc (name, params, options) {
    const q = this.connectionProxy.callproc(name, params)
    return this.run(q, options)
  }

  async query (sql, params, options) {
    const q = this.connectionProxy.query(sql, params)
    return this.run(q, options)
  }

  async queryPrepared (q, options) {
    return this.run(q, options)
  }
}

exports.QueryAggregator = QueryAggregator
exports.stripDriverPrefix = stripDriverPrefix
