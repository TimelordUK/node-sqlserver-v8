/**
 * Created by Stephen on 9/27/2015.
 */

'use strict'

const procedureModule = ((() => {
  const { ServerDialect } = require('./dialect')
  class BoundProcedure {
    constructor (connectionDriverMgr, procedureNotifier, theConnection, paramVector, procedureName, pollingEnabled, procedureTimeout) {
      const conn = theConnection
      const driverMgr = connectionDriverMgr
      const notifier = procedureNotifier

      const name = procedureName
      let timeout = procedureTimeout
      let polling = pollingEnabled

      let dialect = ServerDialect.SqlServer

      let meta = constructMeta(name, paramVector)

      function constructMeta (name, paramVector) {
        paramVector = where(paramVector, p => p.object_id !== null)
        const outputParams = where(paramVector, p => p.is_output)
        const inputParams = where(paramVector, p => !p.is_output)

        const signature = buildSignature(paramVector, name)
        const select = asSelect(paramVector, name)
        const summary = summarise(name, paramVector)
        const paramByName = paramVector.reduce((agg, latest) => {
          if (latest.name) {
            agg[latest.name.slice(1)] = latest
          }
          return agg
        }, {})

        return {
          select,
          signature,
          summary,
          params: paramVector,
          outputParams,
          inputParams,
          paramByName
        }
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

      function buildSignature (pv, name) {
        const pars = pv.reduce((aggr, latest, i) => {
          if (i > 0) {
            aggr.push(`${latest.name} = ?`)
          }
          return aggr
        }, []).join(', ')
        return `{ ? = call ${name}(${pars}) }`
      }

      function asSelect (pv, procedure) {
        if (dialect === ServerDialect.SqlServer) {
          return asSelectSqlServer(pv, procedure)
        } else {
          return asSelectSybase(pv, procedure)
        }
      }

      function asSelectSybase (pv, procName) {
        const params = []
        const parameters = []
        pv.forEach(param => {
          if (param.name !== '@returns') {
            parameters.push(param)
          }
        })

        parameters.forEach(param => {
          if (param.is_output) {
            const size = param.type_id === 'varchar' ? `(${param.max_length})` : ''
            const s = `${param.name} ${param.type_id}${size}`
            params.push(s)
          }
        })

        let cmdParam = ['@___return___ int'].concat(params).join(', ')
        let cmd = `declare ${cmdParam} `
        cmd += `exec @___return___ = ${procName} `

        const spp = []
        parameters.forEach(param => {
          if (param.is_output) {
            // output parameter
            cmdParam = `${param.name} output`
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
        cmd += sppJoined + ' '
        const selectCmd = `select ${['@___return___ as \'___return___\''].concat(params2).join(', ')}`
        cmd += selectCmd + ' '

        return cmd
      }

      function asSelectSqlServer (pv, procName) {
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
        cmd += `exec @___return___ = ${procName} `

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

      function setDialect (d) {
        dialect = d
        meta = constructMeta(name, paramVector)
      }

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
        return meta.params.map(p => {
          return {
            is_output: p.is_output,
            name: p.name.slice(1),
            type_id: p.type_id,
            max_length: p.max_length,
            is_user_defined: p.is_user_defined,
            use_default: false,
            val: null
          }
        })
      }

      function mapParamObjectToFullParamVector (vec, meta, params) {
        for (let i = 0; i < meta.params.length; i += 1) {
          const latest = vec[i]
          const name = meta.params[i].name.slice(1)
          const v = Object.prototype.hasOwnProperty.call(params, name) ? params[name] : null
          if (latest.is_user_defined) {
            vec[i] = v
          } else {
            latest.val = v
          }
          // when using an object based parameter mark those params not included such
          // that default keyword is used in sql submitted
          const onParams = Object.prototype.hasOwnProperty.call(params, latest.name)
          if (!latest.is_output && !onParams) {
            latest.use_default = true
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
        return Array.isArray(params) ? mapParamArrayToFullParamVector(vec, params) : mapParamObjectToFullParamVector(vec, meta, params)
      }

      function forwardError (msg, notify, cb) {
        const error = new Error(`${name}: ${msg}`)
        if (cb) {
          cb(error, null, null)
        } else {
          setImmediate(() => {
            notify.emit('error', error)
          })
        }
      }

      function where (list, primitive) {
        return list.reduce((agg, latest) => {
          if (primitive(latest)) {
            agg.push(latest)
          }
          return agg
        }, [])
      }

      function getProblemParams (list, primitive) {
        const failures = where(list, primitive)
        if (failures.length > 0) {
          const failureNames = failures.map(p => p.name)
          return failureNames.join()
        }
        return null
      }

      function checkParamIntegrityOnParamObject (userParamObject) {
        const illegalMissingNames = getProblemParams(Object.keys(userParamObject).map(name => {
          return {
            name
          }
        }), p =>
          !Object.prototype.hasOwnProperty.call(meta.paramByName, p.name))
        if (illegalMissingNames) {
          return `illegal params on param object = ${illegalMissingNames}`
        }
      }

      function checkParamIntegrity (userParamArrayOrObject) {
        if (meta.params.length === 0) {
          return 'proc could not be found'
        }
        if (Array.isArray(userParamArrayOrObject) && userParamArrayOrObject.length >= meta.params.length) {
          return `illegal parameter count, expected <= ${meta.params.length - 1}`
        }
        if (!Array.isArray(userParamArrayOrObject)) {
          return checkParamIntegrityOnParamObject(userParamArrayOrObject)
        }
        return null
      }

      function build (pv, name) {
        // for sybase do not support mix of default input and output parameters
        const isSybase = dialect === ServerDialect.Sybase
        const withOutput = pv.filter(latest => latest.is_output && latest.name !== 'returns')
        const pars = pv.reduce((aggr, latest, i) => {
          if (i > 0) {
            if (latest.use_default) {
              if (!isSybase) {
                aggr.push(`@${latest.name} = DEFAULT`)
              }
            } else if (isSybase) {
              if (withOutput.length > 0) {
                aggr.push('?')
              } else {
                aggr.push(`@${latest.name} = ?`)
              }
            } else {
              aggr.push(`@${latest.name} = ?`)
            }
          }
          return aggr
        }, []).join(', ')
        return `{ ? = call ${name}(${pars}) }`
      }

      function privateCall (notify, params, cb) {
        const errorMsg = checkParamIntegrity(params)
        if (errorMsg) {
          forwardError(errorMsg, notify, cb)
          setImmediate(() => {
            notify.emit('free')
          })
          return
        }
        let paramVec = bindParams(meta, params)
        const signature = build(paramVec, name)
        paramVec = where(paramVec, latest => !latest.use_default)
        if (cb) {
          callStoredProcedure(notify, signature, paramVec, (err, results, output, more) => {
            cb(err, results, output, more)
          })
        } else {
          callStoredProcedure(notify, signature, paramVec)
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
      this.setDialect = setDialect
    }
  }

  class ProcedureMgr {
    constructor (procedureConnection, procedureNotifier, procedureDriverMgr, metaResolver, sharedCache) {
      const cache = sharedCache || {}
      const conn = procedureConnection
      let timeout = 0
      let polling = false
      const driverMgr = procedureDriverMgr
      const notifier = procedureNotifier

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
            schemaName = procedureName.substring(0, schemaIndex)
            unqualifiedTableName = procedureName.substring(schemaIndex + 1)
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

      /*
      {
  proc_name: "test_sp",
  type_desc: "SQL_STORED_PROCEDURE",
  object_id: 1446165539,
  has_default_value: false,
  default_value: null,
  is_output: false,
  name: "@param",
  type_id: "varchar",
  max_length: 50,
  order: 1,
  collation: "SQL_Latin1_General_CP1_CI_AS",
  is_user_defined: null,
}
      */

      function makeParam (procName, paramName, paramType, paramLength, isOutput) {
        return {
          proc_name: procName,
          type_desc: 'SQL_STORED_PROCEDURE',
          object_id: -1,
          has_default_value: false,
          default_value: null,
          is_output: isOutput,
          name: paramName,
          type_id: paramType,
          max_length: paramLength,
          order: 1,
          collation: '',
          is_user_defined: null
        }
      }

      function addProc (name, paramVector) {
        if (paramVector.length === 0 || paramVector[0].name !== '@returns') {
          const retMeta = returnMeta()
          paramVector.unshift(retMeta)
        }

        const procedure = new BoundProcedure(driverMgr, notifier, conn, paramVector, name, polling, timeout)
        cache[name] = procedure
        return procedure
      }

      function createProcedure (name, cb) {
        let procedure = cache[name]
        if (!procedure) {
          describeProcedure(name, (err, paramVector) => {
            if (!err) {
              procedure = addProc(name, paramVector)
              cb(null, procedure)
            } else {
              cb(err, null)
            }
          })
        } else {
          cb(null, procedure)
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

      function getProc (name, cb) {
        createProcedure(name, (err, p) => {
          cb(err, p)
        })
      }

      function get (name, cb) {
        createProcedure(name, (err, p) => {
          if (err) {
            cb(err)
          } else {
            cb(p)
          }
        })
      }

      function callproc (name, paramsOrCb, cb) {
        const notify = conn.getNotify()
        createProcedure(name, (e, p) => {
          if (e) {
            const err = new Error(`unable to construct proc ${name} ${e.message}`)
            if (cb) {
              cb(err, null, null)
            } else {
              notify.emit('error', err)
            }
          } else {
            p.callNotify(paramsOrCb, cb, notify)
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

      this.makeParam = makeParam
      this.setTimeout = setTimeout
      this.setPolling = setPolling
      this.addProc = addProc
      this.callproc = callproc
      this.describe = describe
      this.getCount = getCount
      this.clear = clear
      this.get = get // legacy call
      this.getProc = getProc
      this.ServerDialect = ServerDialect
    }
  }

  return {
    ProcedureMgr
  }
})())

exports.procedureModule = procedureModule
