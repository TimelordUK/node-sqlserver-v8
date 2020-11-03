/**
 * Created by Stephen on 9/27/2015.
 */

'use strict'

const procedureModule = ((() => {
  class BoundProcedure {
    constructor (connectionDriverMgr, procedureNotifier, theConnection, procedureMeta, procedureName, pollingEnabled, procedureTimeout) {
      const conn = theConnection
      const driverMgr = connectionDriverMgr
      const notifier = procedureNotifier
      const meta = procedureMeta
      const name = procedureName
      let timeout = procedureTimeout
      let polling = pollingEnabled

      function setTimeout (t) {
        timeout = t
      }

      function setPolling (b) {
        polling = b
      }

      function getMeta () {
        return meta
      }

      function getName () {
        return name
      }

      function callStoredProcedure (notify, signature, paramsOrCallback, callback) {
        const queryOb = {
          query_str: signature,
          query_timeout: timeout,
          query_polling: polling
        }

        notifier.validateParameters(
          [
            {
              type: 'string',
              value: queryOb.query_str,
              name: 'query string'
            }
          ],
          'callproc'
        )

        notify.setQueryObj(queryOb)
        const chunky = notifier.getChunkyArgs(paramsOrCallback, callback)

        function onProcedureRaw (err, results, more, outputParams) {
          if (chunky.callback) {
            if (err) {
              chunky.callback(err)
            } else {
              chunky.callback(err, driverMgr.objectify(results), outputParams, more)
            }
          }
        }

        if (callback) {
          driverMgr.realAllProc(notify, queryOb, chunky.params, onProcedureRaw)
        } else {
          driverMgr.realAllProc(notify, queryOb, chunky.params)
        }

        return notify
      }

      function paramsArray (params) {
        if (Array.isArray(params)) {
          return params
        }
        return meta.params.reduce((agg, latest, i) => {
          if (i === 0) return agg
          const name = latest.name.slice(1)
          const v = Object.prototype.hasOwnProperty.call(params, name) ? params[name] : null
          agg.push(v)
          return agg
        }, [])
      }

      function initFullParamVector (meta) {
        const vec = meta.params.map(p => {
          return {
            is_output: p.is_output,
            type_id: p.type_id,
            max_length: p.max_length,
            is_user_defined: p.is_user_defined,
            val: null
          }
        })
        return vec
      }

      function mapParamObjectToFullParamVector (vec, meta, params) {
        for (let i = 0; i < meta.params.length; i += 1) {
          const name = meta.params[i].name.slice(1)
          const v = Object.prototype.hasOwnProperty.call(params, name) ? params[name] : null
          if (vec[i].is_user_defined) {
            vec[i] = v
          } else {
            vec[i].val = v
          }
        }
        return vec
      }

      function mapParamArrayToFullParamVector (vec, params) {
        let j = 1 // skip the first return code bound

        for (let i = 0; i < params.length; i += 1) {
          if (params.length < vec.length - 1) {
            while (j < vec.length && vec[j].is_output === true) {
              j += 1
            }
          }
          if (j >= vec.length) break
          if (vec[j].is_user_defined) {
            vec[j] = params[i]
          } else {
            vec[j].val = params[i]
          }
          j += 1
        }
        return vec
      }

      function bindParams (meta, params) {
        const vec = initFullParamVector(meta)
        const mapped = Array.isArray(params) ? mapParamArrayToFullParamVector(vec, params) : mapParamObjectToFullParamVector(vec, meta, params)
        return mapped
      }

      function forwardError (msg, notify, cb) {
        const error = new Error(`${name}: ${msg}`)
        if (cb) {
          cb(error, null, null)
        } else {
          notify.emit('error', error)
        }
      }

      function checkParamIntegrity (params) {
        if (meta.params.length === 0) {
          return 'proc could not be found'
        }
        if (Array.isArray(params) && params.length >= meta.params.length) {
          return `illegal parameter count, expected <= ${meta.params.length - 1}`
        }
        return null
      }

      function privateCall (notify, params, cb) {
        var errorMsg = checkParamIntegrity(params)
        if (errorMsg) {
          forwardError(errorMsg, notify, cb)
          return
        }
        const paramVec = bindParams(meta, params)
        if (cb) {
          callStoredProcedure(notify, meta.signature, paramVec, (err, results, output, more) => {
            cb(err, results, output, more)
          })
        } else {
          callStoredProcedure(notify, meta.signature, paramVec)
        }
      }

      function callNotify (paramsOrCb, fn, notify) {
        let vec
        let cb
        if (Array.isArray(paramsOrCb)) {
          vec = paramsOrCb
          cb = fn
        } else if (typeof paramsOrCb === 'function') {
          vec = []
          cb = paramsOrCb
        } else {
          vec = paramsOrCb
          cb = fn
        }

        privateCall(notify, vec, cb)
      }

      function call (paramsOrCb, fn) {
        const notify = conn.getNotify()
        callNotify(paramsOrCb, fn, notify)

        return notify
      }

      this.paramsArray = paramsArray
      this.call = call
      this.callNotify = callNotify
      this.setTimeout = setTimeout
      this.setPolling = setPolling
      this.getMeta = getMeta
      this.getName = getName
    }
  }

  class ProcedureMgr {
    constructor (procedureConnection, procedureNotifier, procedureDriverMgr, metaResolver) {
      const cache = {}
      const conn = procedureConnection
      let timeout = 0
      let polling = false
      const driverMgr = procedureDriverMgr
      const notifier = procedureNotifier

      function where (list, primitive) {
        return list.reduce((agg, latest) => {
          if (primitive(latest)) {
            agg.push(latest)
          }
          return agg
        }, [])
      }

      function returnMeta () {
        return {
          is_output: true,
          name: '@returns',
          type_id: 'int',
          max_length: 4,
          order: 0,
          is_user_defined: false,
          has_default_value: false,
          default_value: null,
          collation: null
        }
      }

      function describeProcedure (procedureName, callback) {
        const ret = returnMeta()
        function mapFn (sql) {
          let schemaName = 'dbo'
          let unqualifiedTableName = procedureName
          const schemaIndex = procedureName.indexOf('.')
          if (schemaIndex > 0) {
            schemaName = procedureName.substr(0, schemaIndex)
            unqualifiedTableName = procedureName.substr(schemaIndex + 1)
          }
          sql = sql.replace(/<escaped_procedure_name>/g, unqualifiedTableName)
          sql = sql.replace(/<schema_name>/g, schemaName)
          return sql
        }

        metaResolver.getProcedureDefinition(conn, procedureName, mapFn).then(results => {
          if (results.length > 0) {
            results.unshift(ret)
          }
          callback(null, results)
        }).catch(err => {
          callback(err, null)
        })
      }

      function descp (p) {
        let s = ''
        s += `${p.name} [ ${p.type_id}${p.is_output
        ? ' out '
        : ' in '} ] `
        return s
      }

      function summarise (name, pv) {
        if (!pv || pv.length === 0) return 'proc does not exist.'
        let s = `${descp(pv[0])} ${name}( `
        for (let i = 1; i < pv.length; i += 1) {
          s += descp(pv[i])
          if (i < pv.length - 1) {
            s += ', '
          }
        }
        s += ' ) '
        return s
      }

      function build (pv, name) {
        let q = '{ '
        const len = pv.length
        q += `? = call ${name}(`
        for (let r = 1; r < len; r += 1) {
          q += ' ?'
          if (r < len - 1) {
            q += ', '
          }
        }
        q += ') }'

        return q
      }

      function asSelect (pv, procedure) {
        const params = []
        const parameters = []
        pv.forEach(param => {
          if (param.name !== '@returns') {
            parameters.push(param)
          }
        })

        parameters.forEach(param => {
          if (param.is_output) {
            const s = `${param.name} ${param.type_id}`
            params.push(s)
          }
        })

        let cmdParam = ['@___return___ int'].concat(params).join(', ')
        let cmd = `declare ${cmdParam};`
        cmd += `exec @___return___ = ${procedure} `

        const spp = []
        parameters.forEach(param => {
          if (param.is_output) {
          // output parameter
            cmdParam = `${param.name}=${param.name} output`
            spp.push(cmdParam)
          } else {
          // input parameter
            cmdParam = param.name + '=?'
            spp.push(cmdParam)
          }
        })

        const params2 = []
        parameters.forEach(param => {
          if (param.is_output) {
            let paramName = param.name
            if (paramName[0] === '@') {
              paramName = paramName.substring(1)
            }
            cmdParam = `${param.name} as ${paramName}`
            params2.push(cmdParam)
          }
        })

        const sppJoined = spp.join(', ')
        cmd += sppJoined + ';'
        const selectCmd = `select ${['@___return___ as \'___return___\''].concat(params2).join(', ')}`
        cmd += selectCmd + ';'

        return cmd
      }

      function constructMeta (name, paramVector) {
        var outputParams = where(paramVector, p => p.is_output)
        var inputParams = where(paramVector, p => !p.is_output)
        var requiredParams = where(inputParams, p => !p.has_default_value)

        const signature = build(paramVector, name)
        const select = asSelect(paramVector, name)
        const summary = summarise(name, paramVector)

        const meta = {
          select: select,
          signature: signature,
          summary: summary,
          params: paramVector,
          outputParams: outputParams,
          inputParams: inputParams,
          requiredParams: requiredParams
        }

        return meta
      }

      function createProcedure (name, cb) {
        let procedure = cache[name]
        if (!procedure) {
          describeProcedure(name, (err, paramVector) => {
            if (!err) {
              var meta = constructMeta(name, paramVector)
              procedure = new BoundProcedure(driverMgr, notifier, conn, meta, name, polling, timeout)
              cache[name] = procedure
              cb(procedure)
            } else {
              cb(err)
            }
          })
        } else {
          cb(procedure)
        }
      }

      function describe (name, cb) {
        createProcedure(name, p => {
          if (p) {
            cb(p)
          } else {
            cb(new Error(`could not get definition of ${name}`))
          }
        })
      }

      function get (name, cb) {
        createProcedure(name, p => {
          cb(p)
        })
      }

      function callproc (name, paramsOrCb, cb) {
        const notify = conn.getNotify()
        createProcedure(name, p => {
          if (p) {
            p.callNotify(paramsOrCb, cb, notify)
          } else {
            var err = new Error(`unable to construct proc ${name}`)
            if (cb) {
              cb(err, null, null)
            } else {
              notify.emit('error', err)
            }
          }
        })
        return notify
      }

      function setTimeout (t) {
        timeout = t
      }

      function clear () {
        Object.keys(cache).forEach(k => {
          delete cache[k]
        })
      }

      function setPolling (b) {
        polling = b
      }

      function getCount () {
        return Object.keys(cache).length
      }

      return {
        setTimeout: setTimeout,
        setPolling: setPolling,
        callproc: callproc,
        describe: describe,
        getCount: getCount,
        clear: clear,
        get: get
      }
    }
  }

  return {
    ProcedureMgr: ProcedureMgr
  }
})())

exports.procedureModule = procedureModule
