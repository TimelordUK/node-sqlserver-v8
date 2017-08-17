/**
 * Created by Stephen on 9/28/2015.
 */

'use strict'

var sql = require('./sqlserver.native')
var dm = require('./driverMgr')
var pm = require('./procedureMgr')
var tm = require('./tableMgr')

function ConnectionWrapper (driver, defCb, name) {
  var defaultCallback = defCb
  var id = name
  var driverMgr = driver
  var inst = this
  var nf = new dm.NotifyFactory()
  var filterNonCriticalErrors = false
  var dead = false
  var useUTC = true
  var t
  var p

  function tableMgr () {
    return t
  }

  function setUseUTC (utc) {
    useUTC = utc
    driverMgr.setUseUTC(utc)
  }

  function procedureMgr () {
    return p
  }

  function close (immediately, callback) {
    if (dead) {
      return
    }

    function onClose (err) {
      setImmediate(function () {
        driverMgr.emptyQueue()
        callback(err)
      })
    }

    // require only callback
    if (typeof immediately === 'function') {
      callback = immediately
      immediately = false
    } else if (typeof immediately !== 'boolean' && immediately !== undefined) {
      throw new Error('[msnodesql] Invalid parameters passed to close.')
    }

    callback = callback || defaultCallback

    dead = true
    driverMgr.close(onClose)
  }

  function FilteredCb (callback, skipStatusErrors) {
    var prevCbError = false
    var app = function apply (err, results, more) {
      if (skipStatusErrors) {
        if (err && more && !prevCbError) {
          prevCbError = true
          return
        }
        if (!err && more) {
          if (prevCbError) {
            prevCbError = false
            return
          }
        }
      }

      callback(err, results, more)
    }

    return app
  }

  function queryRawNotify (notify, queryOrObj, chunky) {
    var queryObj = nf.validateQuery(queryOrObj, useUTC, 'queryRaw')
    driverMgr.readAllQuery(notify, queryObj, chunky.params, chunky.callback)
  }

  function queryNotify (notify, queryOrObj, chunky) {
    nf.validateQuery(queryOrObj, useUTC, 'query')

    function onQueryRaw (err, results, more) {
      if (chunky.callback) {
        if (err) {
          notify.emit('msg', err)
          chunky.callback(err, null, more)
        } else {
          chunky.callback(err, driverMgr.objectify(results), more)
        }
      }
    }

    return queryRawNotify(notify, queryOrObj, nf.getChunkyArgs(chunky.params, onQueryRaw))
  }

  function queryRaw (queryOrObj, paramsOrCallback, callback) {
    if (dead) {
      throw new Error('[msnodesql] Connection is closed.')
    }

    var notify = new nf.StreamEvents()
    notify.setConn(this)
    notify.setQueryObj(queryOrObj)
    var chunky = nf.getChunkyArgs(paramsOrCallback, callback)
    if (filterNonCriticalErrors) {
      chunky.callback = new FilteredCb(chunky.callback, true)
    }
    queryRawNotify(notify, queryOrObj, chunky)
    return notify
  }

  function query (queryOrObj, paramsOrCallback, callback) {
    if (dead) {
      throw new Error('[msnodesql] Connection is closed.')
    }

    var notify = new nf.StreamEvents()
    notify.setConn(this)
    notify.setQueryObj(queryOrObj)
    var chunky = nf.getChunkyArgs(paramsOrCallback, callback)
    if (filterNonCriticalErrors) {
      chunky.callback = new FilteredCb(chunky.callback, true)
    }
    queryNotify(notify, queryOrObj, chunky)
    return notify
  }

  function beginTransaction (callback) {
    if (dead) {
      throw new Error('[msnodesql] Connection is closed.')
    }
    callback = callback || defaultCallback

    driverMgr.beginTransaction(callback)
  }

  function cancelQuery (notify, callback) {
    if (dead) {
      throw new Error('[msnodesql] Connection is closed.')
    }
    var qid = notify.getQueryId()
    var qo = notify.getQueryObj()
    var polling = qo.query_polling || false
    callback = callback || defaultCallback
    if (!polling) {
      setImmediate(function () {
        callback(new Error('Error: [msnodesql] cancel only supported for statements where polling is enabled.'))
      })
    }
    driverMgr.cancel(qid, callback)
  }

  function commit (callback) {
    if (dead) {
      throw new Error('[msnodesql] Connection is closed.')
    }

    callback = callback || defaultCallback

    driverMgr.commit(callback)
  }

  function rollback (callback) {
    if (dead) {
      throw new Error('[msnodesql] Connection is closed.')
    }

    callback = callback || defaultCallback

    driverMgr.rollback(callback)
  }

  // inform driver to prepare the sql statement and reserve it for repeated use with parameters.

  function PreparedStatement (s, c, n, m) {
    var meta = m
    var notify = n
    var cw = c
    var active = true
    var signature = s

    function getMeta () {
      return meta
    }

    function getSignature () {
      return signature
    }

    function getId () {
      return notify.getQueryId()
    }

    function preparedQuery (paramsOrCallback, callback) {
      if (!active) {
        if (callback) {
          callback(new Error('error; prepared statement has been released.'))
        }
      }
      var chunky = nf.getChunkyArgs(paramsOrCallback, callback)

      function onPreparedQuery (err, results, more) {
        if (chunky.callback) {
          if (err) {
            chunky.callback(err)
          } else {
            chunky.callback(err, driverMgr.objectify(results), more)
          }
        }
      }

      driverMgr.readAllPrepared(notify, {}, chunky.params, onPreparedQuery)

      return notify
    }

    function free (callback) {
      driverMgr.freeStatement(notify.getQueryId(), function (err) {
        active = false
        if (callback) {
          callback(err)
        }
      })
    }

    return {
      preparedQuery: preparedQuery,
      meta: meta,
      connection: cw,
      free: free,
      getMeta: getMeta,
      getSignature: getSignature,
      getId: getId
    }
  }

  function prepare (queryOrObj, callback) {
    var notify = new nf.StreamEvents()
    notify.setConn(this)
    notify.setQueryObj(queryOrObj)
    var chunky = nf.getChunkyArgs(callback)
    queryOrObj = nf.validateQuery(queryOrObj, useUTC, 'prepare')

    function onPrepare (err, meta) {
      var prepared = new PreparedStatement(queryOrObj.query_str, inst, notify, meta)
      chunky.callback(err, prepared)
    }

    driverMgr.prepare(notify, queryOrObj, onPrepare)

    return notify
  }

  var publicApi = {
    id: id,
    cancelQuery: cancelQuery,
    queryNotify: queryNotify,
    queryRawNotify: queryRawNotify,
    close: close,
    queryRaw: queryRaw,
    query: query,
    beginTransaction: beginTransaction,
    commit: commit,
    rollback: rollback,
    tableMgr: tableMgr,
    procedureMgr: procedureMgr,
    prepare: prepare,
    setUseUTC: setUseUTC
  }

  t = new tm.TableMgr(publicApi)
  p = new pm.ProcedureMgr(publicApi, nf, driverMgr)

  return publicApi
}

var nextID = 0

function getConnectObject (p) {
  return typeof (p) === 'string'
    ? {
      conn_str: p,
      connect_timeout: 0
    }
    : p
}

function openFrom (parentFn, params, callback) {
  function Conn (p, cb, id) {
    function defaultCallback (err) {
      if (err) {
        throw new Error(err)
      }
    }

    var callback2 = cb
    var native = new sql.Connection()
    var driverMgr = new dm.DriverMgr(native)
    var nf = new dm.NotifyFactory()
    var connection = new ConnectionWrapper(driverMgr, defaultCallback, id)
    connection.setUseUTC(true)
    var connectObj = p

    function open () {
      nf.validateParameters(
        [
          {
            type: 'string',
            value: connectObj.conn_str,
            name: 'connection string'
          },
          {
            type: 'function',
            value: callback,
            name: 'callback'
          }
        ],
        parentFn
      )

      callback2 = callback2 || defaultCallback

      function queueCb (err) {
        setImmediate(function () {
          callback2(err, connection)
        })
      }

      native.open(connectObj, queueCb)
    }

    this.id = connection.id
    this.connection = connection
    this.open = open

    return this
  }

  var c = new Conn(getConnectObject(params), callback, nextID)
  nextID += 1
  c.open()

  return c.connection
}

function queryCloseOnDone (fn, action, connectDetails, queryOrObj, paramsOrCallback, callback) {
  var thisConn
  var nf = new dm.NotifyFactory()
  var args = nf.getChunkyArgs(paramsOrCallback, callback)
  var notify = new nf.StreamEvents()

  function complete (err, res, more) {
    if (!more && thisConn !== null) {
      thisConn.close(function () {
        notify.emit('closed', notify.getQueryId())
        if (args.callback !== null) {
          args.callback(err, res, more)
        }
      })
    } else {
      if (args.callback !== null) {
        args.callback(err, res, more)
      }
    }
  }

  var args2 = {
    params: args.params,
    callback: complete
  }

  function go (err, conn) {
    notify.setConn(conn)
    notify.setQueryObj(queryOrObj)
    thisConn = conn
    notify.emit('open', notify.getQueryId())
    if (err) {
      args2.callback(err, null)
    } else {
      action(conn, notify, args2)
    }
  }

  nf.validateQuery(queryOrObj, true, fn)
  openFrom(fn, connectDetails, go)
  return notify
}

function query (connectDetails, queryOrObj, paramsOrCallback, callback) {
  function action (conn, notify, args) {
    conn.queryNotify(notify, queryOrObj, args)
  }

  return queryCloseOnDone('query', action, connectDetails, queryOrObj, paramsOrCallback, callback)
}

function queryRaw (connectDetails, queryOrObj, paramsOrCallback, callback) {
  function action (conn, notify, args) {
    conn.queryRawNotify(notify, queryOrObj, args)
  }

  return queryCloseOnDone('queryRaw', action, connectDetails, queryOrObj, paramsOrCallback, callback)
}

function open (params, callback) {
  return openFrom('open', params, callback)
}

exports.query = query
exports.queryRaw = queryRaw
exports.open = open
