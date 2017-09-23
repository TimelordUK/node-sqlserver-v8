/**
 * Created by Stephen on 9/27/2015.
 */

'use strict'

function BoundProcedure (connectionDriverMgr, procedureNotifier, theConnection, procedureMeta, procedureName, pollingEnabled, procedureTimeout) {
  var conn = theConnection
  var driverMgr = connectionDriverMgr
  var notifier = procedureNotifier
  var meta = procedureMeta
  var name = procedureName
  var timeout = procedureTimeout
  var polling = pollingEnabled

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
    var queryOb = {
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
    var chunky = notifier.getChunkyArgs(paramsOrCallback, callback)

    function onProcedureRaw (err, results, outputParams, more) {
      if (chunky.callback) {
        if (err) {
          chunky.callback(err)
        } else {
          chunky.callback(err, driverMgr.objectify(results), more, outputParams)
        }
      }
    }

    if (callback) {
      driverMgr.realAllProc(notify, queryOb, chunky.params, onProcedureRaw)
    }else {
      driverMgr.realAllProc(notify, queryOb, chunky.params)
    }

    return notify
  }

  function bindParams (meta, params) {
    var j = 0
    var i
    var col
    for (i = 0; i < params.length; i += 1) {
      while (j < meta.params.length && meta.params[j].is_output === true) {
        j += 1
      }
      if (j < meta.params.length) {
        var pat = meta.params[j]
        if (pat.is_user_defined) {
          for (col = 0; col < pat.table_value_param.length; ++col) {
            var tvp = params[i]
            var colName = pat.table_value_param[col].column_name
            pat.table_value_param[col].val = tvp[colName]
          }
        }
        meta.params[j].val = params[i]
        j += 1
      }
    }
  }

  function privateCall (notify, params, cb) {
    bindParams(meta, params)
    if (cb) {
      callStoredProcedure(notify, meta.signature, meta.params, function (err, results, output) {
        cb(err, results, output)
      })
    }else {
      callStoredProcedure(notify, meta.signature, meta.params)
    }
  }

  function callNotify (paramsOrCb, fn, notify) {
    var vec
    var cb
    if (Array.isArray(paramsOrCb)) {
      vec = paramsOrCb
      cb = fn
    } else {
      vec = []
      cb = paramsOrCb
    }

    notify.setConn(conn)
    privateCall(notify, vec, cb)
  }

  function call (paramsOrCb, fn) {
    var notify = new notifier.StreamEvents()
    callNotify(paramsOrCb, fn, notify)

    return notify
  }

  return {
    call: call,
    callNotify: callNotify,
    setTimeout: setTimeout,
    setPolling: setPolling,
    getMeta: getMeta,
    getName: getName
  }
}

function ProcedureMgr (c, n, dm, metaResolver) {
  var cache = {}
  var conn = c
  var timeout = 0
  var polling = false
  var driverMgr = dm
  var nf = n

  function resolveUserTypes (results, callback) {
    var resolvedUserTypes = []
    var userTypes = []

    results.forEach(function (p) {
      if (p.is_user_defined) {
        userTypes[userTypes.length] = p
      }
    })

    function getUserType (i) {
      var procedureParam = userTypes[i]
      var userTypeName = procedureParam.type_id
      metaResolver.getUserType(conn, userTypeName, function (err, typeResults) {
        if (err) {
          callback(err, resolvedUserTypes)
          return
        }
        procedureParam.table_value_param = typeResults
        resolvedUserTypes[resolvedUserTypes.length] = procedureParam
        if (userTypes.length === resolvedUserTypes.length) {
          callback(null, results)
        }else {
          getUserType(i + 1)
        }
      })
    }

    if (userTypes.length !== resolvedUserTypes.length) {
      getUserType(0)
    } else {
      callback(null, results)
    }
  }

  function describeProcedure (procedureName, callback) {

    var ret = {
      is_output: true,
      name: '@returns',
      type_id: 'int',
      max_length: 4,
      order: 0,
      collation: null
    }

    metaResolver.getProcedure(conn, procedureName, function (err, results) {
      results.unshift(ret)
      if (err) {
        callback(err, null)
        return
      }
      resolveUserTypes(results, function (e, userResults) {
        callback(e, userResults)
      })
    })
  }

  function descp (p) {
    var s = ''
    s += p.name + ' [ ' + p.type_id + (p.is_output
      ? ' out '
      : ' in ') + ' ] '
    return s
  }

  function summarise (name, pv) {
    var i
    var s = descp(pv[0]) + ' ' + name + '( '
    for (i = 1; i < pv.length; i += 1) {
      s += descp(pv[i])
      if (i < pv.length - 1) {
        s += ', '
      }
    }
    s += ' ) '
    return s
  }

  function build (pv, name) {
    var q = '{ '
    var len = pv.length
    q += '? = call ' + name + '('
    var r
    for (r = 1; r < len; r += 1) {
      q += ' ?'
      if (r < len - 1) {
        q += ', '
      }
    }
    q += ') }'

    return q
  }

  function asSelect(pv, procedure) {
    var params = []
    var parameters = []
    pv.forEach(function (param) {
      if (param.name !== '@returns') {
        parameters.push(param)
      }
    })

    parameters.forEach(function (param) {
      if (param.is_output) {
        var s = param.name + ' ' + param.type_id
        params.push(s)
      }
    })

    var cmd_param = ['@___return___ int'].concat(params).join(', ')
    var cmd = 'declare ' + cmd_param + ';'
    cmd += 'exec @___return___ = ' + procedure + ' '

    var spp = []
    parameters.forEach(function (param) {
      if (param.is_output) {
        // output parameter
        cmd_param = param.name + '=' + param.name + ' output'
        spp.push(cmd_param)
      } else {
        // input parameter
        cmd_param = param.name + '=?'
        spp.push(cmd_param)
      }
    })

    var params2 = []
    parameters.forEach(function (param) {
      if (param.is_output) {
        var param_name = param.name
        if (param_name[0] === '@') {
          param_name = param_name.substring(1)
        }
        cmd_param = param.name + ' as ' + param_name
        params2.push(cmd_param)
      }
    })

    var spp_joined = spp.join(', ')
    cmd += spp_joined + ';'
    var select_cmd = 'select ' + ['@___return___ as \'___return___\''].concat(params2).join(', ')
    cmd += select_cmd + ';'

    return cmd
  }

  function createProcedure (name, cb) {
    var procedure = cache[name]
    if (!procedure) {
      describeProcedure(name, function (err, pv) {
        if (!err) {
          var signature = build(pv, name)
          var select = asSelect(pv, name)
          var summary = summarise(name, pv)
          var meta = {
            select: select,
            signature: signature,
            summary: summary,
            params: pv
          }

          procedure = new BoundProcedure(driverMgr, nf, conn, meta, name, polling, timeout)
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
    createProcedure(name, function (p) {
      if (p) {
        cb(p)
      } else {
        cb(new Error('could not get definition of ' + name))
      }
    })
  }

  function get (name, cb) {
    createProcedure(name, function (p) {
      cb(p)
    })
  }

  function callproc (name, paramsOrCb, cb) {
    var notify = new nf.StreamEvents()
    createProcedure(name, function (p) {
      p.callNotify(paramsOrCb, cb, notify)
    })
    return notify
  }

  function setTimeout (t) {
    timeout = t
  }

  function clear () {
    Object.keys(cache).forEach(function (k) {
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

exports.ProcedureMgr = ProcedureMgr
