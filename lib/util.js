const utilModule = ((() => {
  function callprocAggregator (connectionProxy, name, params, options) {
    return new Promise((resolve, reject) => {
      let handle = null
      const ret = {
        elapsed: new Date(),
        meta: [],
        results: [],
        output: null,
        info: null,
        returns: null
      }
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
      const timeoutMs = getOpt(options, 'timeoutMs', 0)
      const raw = getOpt(options, 'raw', false)
      let row = null
      const q = connectionProxy.callproc(name, params)
      if (timeoutMs) {
        handle = setTimeout(() => {
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

      q.on('output', o => {
        ret.output = o
        if (o.length > 0) {
          ret.returns = o[0]
        }
      })

      q.on('error', e => {
        reject(e)
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
      })

      q.on('free', () => {
        resolve(ret)
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
  return {
    callprocAggregator: callprocAggregator
  }
})())

exports.utilModule = utilModule
