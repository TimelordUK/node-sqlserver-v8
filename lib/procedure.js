/**
 * Created by Stephen on 9/27/2015.
 */

'use strict'

var procedureModule = (function () {
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
      } else {
        driverMgr.realAllProc(notify, queryOb, chunky.params)
      }

      return notify
    }

    function bindParams (meta, params) {
      var vec = []
      var j = 0
      var i

      for (i = 0; i < meta.params.length; i += 1) {
        vec[vec.length] = {
          is_output: meta.params[i].is_output,
          type_id: meta.params[i].type_id,
          max_length: meta.params[i].max_length,
          is_user_defined: meta.params[i].is_user_defined,
          val: null
        }
      }

      for (i = 0; i < params.length; i += 1) {
        while (j < meta.params.length && meta.params[j].is_output === true) {
          j += 1
        }

        if (meta.params[j].is_user_defined) {
          vec[j] = params[i]
        } else {
          vec[j].val = params[i]
        }
        j += 1
      }
      return vec
    }

    function privateCall (notify, params, cb) {
      var paramVec = bindParams(meta, params)
      if (cb) {
        callStoredProcedure(notify, meta.signature, paramVec, function (err, results, output) {
          cb(err, results, output)
        })
      } else {
        callStoredProcedure(notify, meta.signature, paramVec)
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

  function ProcedureMgr (procedureConnection, procedureNotifier, procedureDriverMgr, metaResolver) {
    var cache = {}
    var conn = procedureConnection
    var timeout = 0
    var polling = false
    var driverMgr = procedureDriverMgr
    var notifier = procedureNotifier

    function describeProcedure (procedureName, callback) {
      var ret = {
        is_output: true,
        name: '@returns',
        type_id: 'int',
        max_length: 4,
        order: 0,
        collation: null
      }

      function mapFn (sql) {
        var schemaName = 'dbo'
        var unqualifiedTableName = procedureName
        var schemaIndex = procedureName.indexOf('.')
        if (schemaIndex > 0) {
          schemaName = procedureName.substr(0, schemaIndex)
          unqualifiedTableName = procedureName.substr(schemaIndex + 1)
        }
        sql = sql.replace(/<escaped_procedure_name>/g, unqualifiedTableName)
        sql = sql.replace(/<schema_name>/g, schemaName)
        return sql
      }

      metaResolver.getProcedureDefinition(conn, procedureName, mapFn, function (err, results) {
        results.unshift(ret)
        if (err) {
          callback(err, null)
          return
        }
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

    function asSelect (pv, procedure) {
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

      var cmdParam = ['@___return___ int'].concat(params).join(', ')
      var cmd = 'declare ' + cmdParam + ';'
      cmd += 'exec @___return___ = ' + procedure + ' '

      var spp = []
      parameters.forEach(function (param) {
        if (param.is_output) {
          // output parameter
          cmdParam = param.name + '=' + param.name + ' output'
          spp.push(cmdParam)
        } else {
          // input parameter
          cmdParam = param.name + '=?'
          spp.push(cmdParam)
        }
      })

      var params2 = []
      parameters.forEach(function (param) {
        if (param.is_output) {
          var paramName = param.name
          if (paramName[0] === '@') {
            paramName = paramName.substring(1)
          }
          cmdParam = param.name + ' as ' + paramName
          params2.push(cmdParam)
        }
      })

      var sppJoined = spp.join(', ')
      cmd += sppJoined + ';'
      var selectCmd = 'select ' + ['@___return___ as \'___return___\''].concat(params2).join(', ')
      cmd += selectCmd + ';'

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
      var notify = new notifier.StreamEvents()
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

  return {
    ProcedureMgr: ProcedureMgr
  }
}())

exports.procedureModule = procedureModule
