
const utilModule = ((() => {
  const cppDriver = require('../build/Release/sqlserverv8')
  /*
  console.log(stripescape('[node].[dbo].[businessid]'))
  console.log(stripescape('[dbo].[businessid]'))
  console.log(stripescape('dbo.[businessid]'))
  console.log(stripescape('node.dbo.[businessid]'))
  console.log(stripescape('node.dbo.businessid'))
  console.log(stripescape('[age]'))
  console.log(stripescape('name'))

businessid
businessid
businessid
businessid
businessid
age
name
   */

  class Native {
    constructor () {
      this.cppDriver = cppDriver
    }
  }

  class SchemaSplitter {
    stripEscape (columnName) {
      const columnParts = columnName.split(/\.(?![^[]*])/g)
      const qualified = columnParts[columnParts.length - 1]
      const columnNameRegexp = /\[?(.*?)]?$/g
      const match = columnNameRegexp.exec(qualified)
      const trim = match.filter(r => r !== '')
      return trim[trim.length - 1]
    }

    strip (name) {
      return name.replace(/^\[|]$/g, '').replace(/]]/g, ']')
    }

    substitute (sql, decomp) {
      // removes brackets at start end, change ']]' to ']'
      sql = sql.replace(/<table_name>/g, this.strip(decomp.table))
        // removes brackets at start end, change ']]' to ']'
        .replace(/<table_schema>/g, this.strip(decomp.schema))
        // use the escaped table name for the OBJECT_ID() function
        .replace(/<escaped_table_name>/g, decomp.fullTableName)
        // use the escaped table name for the OBJECT_ID() function
        .replace(/<table_catalog>/g, decomp.cat)
      return sql
    }

    decomposeSchema (qualifiedName, cat) {
      cat = cat || ''
      // Split table names like 'dbo.table1' to: ['dbo', 'table1'] and 'table1' to: ['table1']
      const tableParts = qualifiedName.split(/\.(?![^[]*])/g)
      const table = tableParts[tableParts.length - 1] // get the table name
      let fullTableName = table
      // get the table schema, if missing set schema to ''
      const schema = tableParts.length >= 2 ? tableParts[tableParts.length - 2] || '' : ''
      if (tableParts.length > 2) {
        cat = tableParts[tableParts.length - 3]
      } else if (table[0] === '#') {
        cat = '[tempdb]'
        fullTableName = `${cat}.${schema}.${table}`
      }
      return {
        qualifiedName,
        fullTableName,
        cat,
        schema,
        table
      }
    }
  }

  class AggregtorResults {
    constructor (options) {
      this.beginAt = new Date()
      this.elapsed = 0
      this.first = null
      this.meta = []
      this.counts = []
      this.results = []
      this.output = null
      this.info = null
      this.errors = []
      this.options = options
      this.rows = 0
      this.row = null

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
      this.meta.push(meta)
      this.results.push([])
      if (this.first === null) {
        this.first = this.results[0]
      }
    }

    onOutput (o) {
      this.output = o
      if (o.length > 0) {
        this.returns = o[0]
      }
    }

    onRowCount (count) {
      this.counts.push(count)
    }

    onRow () {
      this.rows++
      this.row = this.newRow()
    }

    onInfo (m) {
      if (!this.info) {
        this.info = []
      }
      this.info.push(m.message.substring(m.message.lastIndexOf(']') + 1))
    }

    onDone () {
      this.elapsed = new Date() - this.beginAt
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
      const row = this.options.raw ? [this.meta[resultId].length] : {}
      return row
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
      return new AggregtorResults(options)
    }

    run (q, opt) {
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

        function onRowCount (count) {
          ret.onRowCount(count)
        }

        function onOutput (o) {
          ret.onOutput(o)
        }

        function onError (e, more) {
          ret.errors.push(e)
          if (!more) {
            e._results = ret
          }
        }

        function onInfo (m) {
          ret.onInfo(m)
        }

        function onMeta (meta) {
          ret.onMeta(meta)
        }

        function onRow () {
          ret.onRow()
        }

        function rejectResolve () {
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
          q.removeListener('rowcount', onRowCount)
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

    timeOut (q, timeoutMs, reject) {
      return setTimeout(() => {
        try {
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

    callProc (name, params, options) {
      const q = this.connectionProxy.callproc(name, params)
      return this.run(q, options)
    }

    query (sql, params, options) {
      const q = this.connectionProxy.query(sql, params)
      return this.run(q, options)
    }

    queryPrepared (q, options) {
      return this.run(q, options)
    }
  }
  return {
    QueryAggregator,
    SchemaSplitter,
    Native
  }
})())

exports.utilModule = utilModule
