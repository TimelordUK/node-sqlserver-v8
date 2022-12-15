
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

  class QueryAggregator {
    constructor (connectionProxy) {
      function getOpt (src, p, def) {
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

      function timeOut (q, timeoutMs, reject) {
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

      function emptyResults () {
        return {
          elapsed: new Date(),
          first: null,
          meta: [],
          counts: [],
          results: [],
          output: null,
          info: null,
          errors: [],
          returns: null
        }
      }

      function run (q, options) {
        return new Promise((resolve, reject) => {
          if (connectionProxy.isClosed()) {
            reject(new Error('connection is closed.'))
          }
          let handle = null

          const ret = emptyResults()
          const timeoutMs = getOpt(options, 'timeoutMs', 0)
          const raw = getOpt(options, 'raw', false)
          const replaceEmptyColumnNames = getOpt(options, 'replaceEmptyColumnNames', false)

          let row = null
          if (timeoutMs) {
            handle = timeOut(q, timeoutMs, (e) => {
              if (e) {
                ret.errors.push(e)
              }
            })
          }

          function onRowCount (count) {
            ret.counts.push(count)
          }

          function onOutput (o) {
            ret.output = o
            if (o.length > 0) {
              ret.returns = o[0]
            }
          }

          function onError (e, more) {
            ret.errors.push(e)
            if (!more) {
              e._results = ret
            }
          }

          function onInfo (m) {
            if (!ret.info) {
              ret.info = []
            }
            ret.info.push(m.message.substring(m.message.lastIndexOf(']') + 1))
          }

          function onMeta (meta) {
            for (let i = 0; i < meta.length; ++i) {
              if (replaceEmptyColumnNames) {
                if (!meta[i].name || meta[i].length === 0) {
                  meta[i].name = `Column${i}`
                }
              }
            }
            ret.meta.push(meta)
            ret.results.push([])
            if (ret.first === null) {
              ret.first = ret.results[0]
            }
          }

          function onRow () {
            const resultId = ret.meta.length - 1
            row = raw ? [ret.meta[resultId].length] : {}
          }

          function rejectResolve () {
            if (ret.errors.length > 0) {
              reject(ret.errors[ret.errors.length - 1])
            } else {
              resolve(ret)
            }
          }

          function onDone () {
            if (handle) {
              clearTimeout(handle)
            }
            unSubscribe()
            ret.elapsed = new Date() - ret.elapsed
            if (q.isPrepared()) {
              rejectResolve()
            }
          }

          function onFree () {
            q.removeListener('free', onFree)
            rejectResolve()
          }

          function onColumn (c, v) {
            const resultId = ret.meta.length - 1
            const meta = ret.meta[resultId]
            const results = ret.results[resultId]
            if (raw) {
              row[c] = v
            } else {
              row[meta[c].name] = v
            }
            if (c === meta.length - 1) {
              results.push(row)
            }
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

      function callProc (name, params, options) {
        const q = connectionProxy.callproc(name, params)
        return run(q, options)
      }

      function query (sql, params, options) {
        const q = connectionProxy.query(sql, params)
        return run(q, options)
      }

      function queryPrepared (q, options) {
        return run(q, options)
      }

      this.queryPrepared = queryPrepared
      this.callProc = callProc
      this.query = query
    }
  }
  return {
    QueryAggregator,
    SchemaSplitter,
    Native
  }
})())

exports.utilModule = utilModule
