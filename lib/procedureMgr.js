/**
 * Created by Stephen on 9/27/2015.
 */

'use strict'

function BoundProcedure (dm, n, c, m, na, pol, to) {
  var conn = c
  var driverMgr = dm
  var nf = n
  var meta = m
  var name = na
  var timeout = to
  var polling = pol

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

    nf.validateParameters(
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
    var chunky = nf.getChunkyArgs(paramsOrCallback, callback)

    function onProcRaw (err, results, outputParams, more) {
      if (chunky.callback) {
        if (err) {
          chunky.callback(err)
        } else {
          chunky.callback(err, driverMgr.objectify(results), more, outputParams)
        }
      }
    }

    driverMgr.realAllProc(notify, queryOb, chunky.params, onProcRaw)

    return notify
  }

  function bindParams (meta, params) {
    var j = 0
    var i
    for (i = 0; i < params.length; i += 1) {
      while (j < meta.params.length && meta.params[j].is_output === true) {
        j += 1
      }
      if (j < meta.params.length) {
        meta.params[j].val = params[i]
        j += 1
      }
    }
  }

  function privateCall (notify, params, cb) {
    bindParams(meta, params)
    callStoredProcedure(notify, meta.signature, meta.params, function (err, results, output) {
      cb(err, results, output)
    })
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
    var notify = new nf.StreamEvents()
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

function ProcedureMgr (c, n, dm) {
  var cache = {}
  var conn = c
  var timeout = 0
  var polling = false
  var driverMgr = dm
  var nf = n

  function describeProcedure (procName, callback) {
    var sql = 'select \n' +
      'is_output, \n' +
      'name, \n' +
      'type_id   = type_name(user_type_id), \n' +
      'max_length, \n' +
      '\'order\'  = parameter_id, \n' +
      '\'collation\'   = convert(sysname, \n' +
      ' case when system_type_id in (35, 99, 167, 175, 231, 239) \n' +
      ' then ServerProperty(\'collation\') end) \n' +
      ' from sys.parameters sp where object_id = object_id(\'' + procName + '\') \n'

    var ret = {
      is_output: true,
      name: '@returns',
      type_id: 'int',
      max_length: 4,
      order: 0,
      collation: null
    }

    conn.query(sql, function (err, results) {
      results.unshift(ret)
      callback(err, results)
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

  function createProcedure (name, cb) {
    var procedure = cache[name]
    if (!procedure) {
      describeProcedure(name, function (err, pv) {
        if (!err) {
          var signature = build(pv, name)
          var summary = summarise(name, pv)
          var meta = {
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
