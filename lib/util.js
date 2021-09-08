const utilModule = ((() => {
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
              reject(e || new Error(`query cancelled timeout ${timeoutMs}`))
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
          let handle = null

          const ret = emptyResults()
          const timeoutMs = getOpt(options, 'timeoutMs', 0)
          const raw = getOpt(options, 'raw', false)

          let row = null
          if (timeoutMs) {
            handle = timeOut(q, timeoutMs, reject)
          }

          q.on('rowcount', count => {
            ret.counts.push(count)
          })

          q.on('output', o => {
            ret.output = o
            if (o.length > 0) {
              ret.returns = o[0]
            }
          })

          q.on('error', (e, more) => {
            ret.errors.push(e)
            if (!more) {
              e._results = ret
            }
          })

          q.on('info', m => {
            if (!ret.info) {
              ret.info = []
            }
            ret.info.push(m.message.substr(m.message.lastIndexOf(']') + 1))
          })

          q.on('meta', meta => {
            ret.meta.push(meta)
            ret.results.push([])
            if (ret.first === null) {
              ret.first = ret.results[0]
            }
          })

          q.on('row', () => {
            const resultId = ret.meta.length - 1
            row = raw ? [ret.meta[resultId].length] : {}
          })

          q.on('done', () => {
            if (handle) {
              clearTimeout(handle)
            }
            ret.elapsed = new Date() - ret.elapsed
            if (q.isPrepared()) {
              resolve(ret)
            }
          })

          q.on('free', () => {
            if (ret.errors.length > 0) {
              reject(ret.errors[ret.errors.length - 1])
            } else {
              resolve(ret)
            }
          })

          q.on('column', (c, v) => {
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
          })
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
    QueryAggregator: QueryAggregator
  }
})())

exports.utilModule = utilModule
