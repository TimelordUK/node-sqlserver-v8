/**
 * Created by Stephen on 9/27/2015.
 */

'use strict'

var fs = require('fs')

var folder = __dirname

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

    function onProcedureRaw (err, results, outputParams, more) {
      if (chunky.callback) {
        if (err) {
          chunky.callback(err)
        } else {
          chunky.callback(err, driverMgr.objectify(results), more, outputParams)
        }
      }
    }

    driverMgr.realAllProc(notify, queryOb, chunky.params, onProcedureRaw)

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
  var describeSql
  var userTypeSql
  var cache = {}
  var conn = c
  var timeout = 0
  var polling = false
  var driverMgr = dm
  var nf = n

  function readFile (f, done) {
    fs.readFile(f, 'utf8', function (err, data) {
      if (err) {
        done(err)
      } else {
        done(data)
      }
    })
  }

  function resolveUserTypes (results, callback) {
    var resolvedUserTypes = []
    var userTypes = []

    results.forEach(function (p) {
      if (p.is_user_defined) {
        userTypes[userTypes.length] = p
      }
    })

    function getUserType (i, sql) {
      var procedureParam = userTypes[i]
      var userTypeName = procedureParam.type_id
      sql = sql.replace(/<user_type_name>/g, userTypeName)
      conn.query(sql, function (err, typeResults) {
        if (err) {
          callback(err, resolvedUserTypes)
          return
        }
        procedureParam.table_value_param = typeResults
        resolvedUserTypes[resolvedUserTypes.length] = procedureParam
        if (userTypes.length === resolvedUserTypes.length) {
          callback(null, results)
          return
        }
        getUserType(i + 1, sql)
      })
    }

    if (userTypes.length !== resolvedUserTypes.length) {
      if (!userTypeSql) {
        readFile(folder + '/user_type.sql', function (data) {
          userTypeSql = data
          getUserType(0, userTypeSql)
        })
      }
    } else {
      callback(null, results)
    }
  }

  function describeProcedure (procedureName, callback) {
    function done (sql) {
      var ret = {
        is_output: true,
        name: '@returns',
        type_id: 'int',
        max_length: 4,
        order: 0,
        collation: null
      }
      sql = sql.replace(/<escaped_procedure_name>/g, procedureName)
      conn.query(sql, function (err, results) {
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

    if (!describeSql) {
      readFile(folder + '/proc_describe.sql', function (data) {
        describeSql = data
        done(describeSql)
      })
    } else {
      done(describeSql)
    }
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
