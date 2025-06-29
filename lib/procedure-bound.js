'use strict'

const { userModule } = require('./user')
const { ProcedureMeta } = require('./procedure-meta')
const userTypes = new userModule.SqlTypes()

class ProcedureTypedParam {
  constructor (p) {
    this.is_output = p.is_output
    this.name = p.name.slice(1)
    this.type_id = p.type_id
    this.max_length = p.max_length
    this.is_user_defined = p.is_user_defined
    this.precision = p.precision
    this.scale = p.scale
    this.use_default = false
    this.val = userTypes.getSqlTypeFromDeclaredType(p, null)
    this.val.precision = p.precision > 0 ? p.precision : 0
    this.val.scale = p.scale
    this.val.max_length = p.max_length > 0 ? p.max_length : 0
  }
}

class ProcedurePromises {
  constructor (proc) {
    this.proc = proc
  }

  call (params, options) {
    const proc = this.proc
    return proc.conn.promises.callProc(proc.name, params, options)
  }
}

class ProcedureBound {
  constructor (connectionDriverMgr, procedureNotifier, theConnection, paramVector, procedureName, pollingEnabled, procedureTimeout) {
    this.conn = theConnection
    this.driverMgr = connectionDriverMgr
    this.notifier = procedureNotifier
    this.name = procedureName
    this.timeout = procedureTimeout
    this.polling = pollingEnabled
    this.meta = new ProcedureMeta(this.name, paramVector)
    this.promises = new ProcedurePromises(this)
  }

  hasProp (parent, name) {
    return Object.prototype.hasOwnProperty.call(parent, name)
  }

  setDialect (d) {
    this.meta.dialect = d
    this.meta.reconstruct()
  }

  setTimeout (t) {
    this.timeout = t
  }

  setPolling (b) {
    this.polling = b
  }

  getMeta () {
    return this.meta
  }

  getName () {
    return this.name
  }

  callStoredProcedure (notify, signature, paramsOrCallback, callback) {
    const queryOb = new this.notifier.QueryObject(signature, this.timeout, this.polling)
    this.notifier.validateParameters(
      [
        new this.notifier.LexicalParam('string', queryOb.query_str, 'query string')
      ],
      'callproc'
    )

    notify.setQueryObj(queryOb)
    const cb = notify.setStateChangeCallback()
    const chunky = this.notifier.getChunkyArgs(paramsOrCallback, callback)
    const driverMgr = this.driverMgr

    function onProcedureRaw (err, results, more, outputParams) {
      if (chunky.callback) {
        if (err) {
          chunky.callback(err)
        } else {
          chunky.callback(err, driverMgr.objectify(results), outputParams, more)
        }
      }
    }
    queryOb.stateChangeCallback = cb
    notify.once('stateChange', stateChange => {
      // Cancel when the statement is actually submitted to ODBC
      if (stateChange.newState === 'STATEMENT_SUBMITTED') {
        notify.setHandle(stateChange.handle)
      }
    })
    if (callback) {
      driverMgr.readAllProc(notify, queryOb, chunky.params, onProcedureRaw)
    } else {
      driverMgr.readAllProc(notify, queryOb, chunky.params)
    }

    return notify
  }

  paramsArray (params) {
    if (Array.isArray(params)) {
      return params
    }
    return this.meta.params.reduce((agg, latest, i) => {
      if (i === 0) return agg
      const name = latest.name.slice(1)
      const v = this.hasProp(params, name) ? params[name] : null
      agg.push(v)
      return agg
    }, [])
  }

  initFullParamVector (meta) {
    return meta.params.map(p => new ProcedureTypedParam(p))
  }

  // with encryption must bind exactly with no implicit conversions -
  // easier to do this in JS and hand to cpp in right type.
  assignParam (param, v) {
    if (param.isDateTime) {
      param.parse(v)
    } else {
      param.value = v
    }
  }

  mapParamObjectToFullParamVector (vec, meta, params) {
    for (let i = 0; i < meta.params.length; i += 1) {
      const latest = vec[i]
      const name = meta.params[i].name.slice(1)
      const v = this.hasProp(params, name) ? params[name] : null
      if (latest.is_user_defined) {
        vec[i] = v
      } else {
        this.assignParam(latest.val, v)
      }
      // when using an object based parameter mark those params not included such
      // that default keyword is used in sql submitted
      const onParams = this.hasProp(params, latest.name)
      if (!latest.is_output && !onParams) {
        latest.use_default = true
      }
    }

    return vec
  }

  mapParamArrayToFullParamVector (vec, params) {
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
        this.assignParam(vec[j].val, params[i])
      }
      j += 1
    }
    return vec
  }

  bindParams (meta, params) {
    const vec = this.initFullParamVector(meta)
    return Array.isArray(params)
      ? this.mapParamArrayToFullParamVector(vec, params)
      : this.mapParamObjectToFullParamVector(vec, meta, params)
  }

  forwardError (msg, notify, cb) {
    const error = new Error(`${this.name}: ${msg}`)
    if (cb) {
      cb(error, null, null)
    } else {
      setImmediate(() => {
        notify.emit('error', error)
      })
    }
  }

  getProblemParams (list, primitive) {
    const failures = list.filter(p => primitive(p))
    if (failures.length > 0) {
      const failureNames = failures.map(p => p.name)
      return failureNames.join()
    }
    return null
  }

  checkParamIntegrityOnParamObject (userParamObject) {
    const illegalMissingNames = this.getProblemParams(Object.keys(userParamObject).map(name => {
      return {
        name
      }
    }), p =>
      !this.hasProp(this.meta.paramByName, p.name))
    if (illegalMissingNames) {
      return `illegal params on param object = ${illegalMissingNames}`
    }
  }

  checkParamIntegrity (userParamArrayOrObject) {
    if (this.meta.params.length === 0) {
      return 'proc could not be found'
    }
    if (Array.isArray(userParamArrayOrObject) && userParamArrayOrObject.length >= this.meta.params.length) {
      return `illegal parameter count, expected <= ${this.meta.params.length - 1}`
    }
    if (!Array.isArray(userParamArrayOrObject)) {
      return this.checkParamIntegrityOnParamObject(userParamArrayOrObject)
    }
    return null
  }

  build (pv, name) {
    // for sybase do not support mix of default input and output parameters
    const isSybase = this.meta.isSybase()
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

  privateCall (notify, params, cb) {
    const errorMsg = this.checkParamIntegrity(params)
    if (errorMsg) {
      this.forwardError(errorMsg, notify, cb)
      setImmediate(() => {
        notify.emit('free')
      })
      return
    }
    let paramVec = this.bindParams(this.meta, params)
    const signature = this.build(paramVec, this.name)
    paramVec = paramVec.filter(latest => !latest.use_default)
    if (cb) {
      this.callStoredProcedure(notify, signature, paramVec, (err, results, output, more) => {
        cb(err, results, output, more)
      })
    } else {
      this.callStoredProcedure(notify, signature, paramVec)
    }
  }

  callNotify (paramsOrCb, fn, notify) {
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

    this.privateCall(notify, vec, cb)
  }

  call (paramsOrCb, fn) {
    const notify = this.conn.getNotify(paramsOrCb)
    this.callNotify(paramsOrCb, fn, notify)
    return notify
  }
}
exports.ProcedureBound = ProcedureBound
