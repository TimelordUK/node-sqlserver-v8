const { ServerDialect } = require('./dialect')
const { userModule } = require('./user')
const userTypes = new userModule.SqlTypes()

class PrcedureParamMeta {
  constructor (raw) {
    this.proc_name = raw.proc_name
    this.type_desc = raw.type_desc
    this.object_id = raw.object_id
    this.has_default_value = raw.has_default_value
    this.default_value = raw.default_value
    this.is_output = raw.is_output
    this.name = raw.name
    this.type_id = raw.type_id
    this.max_length = raw.max_length
    this.order = raw.order
    this.collation = raw.collation
    this.is_user_defined = raw.is_user_defined
  }
}

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

class ProcedureBound {
  constructor (connectionDriverMgr, procedureNotifier, theConnection, paramVector, procedureName, pollingEnabled, procedureTimeout) {
    this.conn = theConnection
    this.driverMgr = connectionDriverMgr
    this.notifier = procedureNotifier
    this.name = procedureName
    this.timeout = procedureTimeout
    this.polling = pollingEnabled
    this.dialect = ServerDialect.SqlServer
    this.paramVector = paramVector.map(p => new PrcedureParamMeta(p))
    this.meta = this.constructMeta(this.name, paramVector)
  }

  constructMeta (name, paramVector) {
    paramVector = this.where(paramVector, p => p.object_id !== null)
    const outputParams = this.where(paramVector, p => p.is_output)
    const inputParams = this.where(paramVector, p => !p.is_output)

    const signature = this.buildSignature(paramVector, name)
    const select = this.asSelect(paramVector, name)
    const summary = this.summarise(name, paramVector)
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

  descp (p) {
    let s = ''
    s += `${p.name} [ ${p.type_id}${p.is_output
      ? ' out '
      : ' in '} ] `
    return s
  }

  hasProp (parent, name) {
    return Object.prototype.hasOwnProperty.call(parent, name)
  }

  summarise (name, pv) {
    if (!pv || pv.length === 0) return 'proc does not exist.'
    let s = `${this.descp(pv[0])} ${name}( `
    for (let i = 1; i < pv.length; i += 1) {
      s += this.descp(pv[i])
      if (i < pv.length - 1) {
        s += ', '
      }
    }
    s += ' ) '
    return s
  }

  buildSignature (pv, name) {
    const pars = pv.reduce((aggr, latest, i) => {
      if (i > 0) {
        aggr.push(`${latest.name} = ?`)
      }
      return aggr
    }, []).join(', ')
    return `{ ? = call ${name}(${pars}) }`
  }

  asSelect (pv, procedure) {
    if (this.dialect === ServerDialect.SqlServer) {
      return this.asSelectSqlServer(pv, procedure)
    } else {
      return this.asSelectSybase(pv, procedure)
    }
  }

  asOutput (parameters) {
    const params2 = []
    parameters.forEach(param => {
      if (param.is_output) {
        let paramName = param.name
        if (paramName[0] === '@') {
          paramName = paramName.substring(1)
        }
        const cmdParam = `${param.name} as ${paramName}`
        params2.push(cmdParam)
      }
    })
    return params2
  }

  asSelectSybase (pv, procName) {
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

    const params2 = this.asOutput(parameters)

    const sppJoined = spp.join(', ')
    cmd += sppJoined + ' '
    const selectCmd = `select ${['@___return___ as \'___return___\''].concat(params2).join(', ')}`
    cmd += selectCmd + ' '

    return cmd
  }

  asSelectSqlServer (pv, procName) {
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

    const params2 = this.asOutput(parameters)

    const sppJoined = spp.join(', ')
    cmd += sppJoined + ';'
    const selectCmd = `select ${['@___return___ as \'___return___\''].concat(params2).join(', ')}`
    cmd += selectCmd + ';'

    return cmd
  }

  setDialect (d) {
    this.dialect = d
    this.meta = this.constructMeta(this.name, this.paramVector)
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
    const queryOb = {
      query_str: signature,
      query_timeout: this.timeout,
      query_polling: this.polling
    }

    this.notifier.validateParameters(
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

  where (list, primitive) {
    return list.reduce((agg, latest) => {
      if (primitive(latest)) {
        agg.push(latest)
      }
      return agg
    }, [])
  }

  getProblemParams (list, primitive) {
    const failures = this.where(list, primitive)
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
    const isSybase = this.dialect === ServerDialect.Sybase
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
    paramVec = this.where(paramVec, latest => !latest.use_default)
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
