/**
 * Created by Stephen on 9/28/2015.
 */

'use strict'

var connectionModule = (function () {
  // private

  var cppDriver = require('./bootstrap')
  var driverModule = require('./driver').driverModule
  var procedureModule = require('./procedure').procedureModule
  var notifyModule = require('./notifier').notifyModule
  var tableModule = require('./table').tableModule
  var userModule = require('./user').userModule
  var metaModule = require('./meta').metaModule

  var sqlMeta = new metaModule.Meta()
  var userTypes = new userModule.SqlTypes()

  function ConnectionWrapper (driver, defCb, name) {
    var defaultCallback = defCb
    var id = name
    var driverMgr = driver
    var inst = this
    var notifier = new notifyModule.NotifyFactory()
    // var filterNonCriticalErrors = false
    var dead = false
    var useUTC = true
    var t
    var p

    function getUserTypeTable (name, callback) {
      function mapFn (sql) {
        var schemaName = 'dbo'
        var unqualifiedTableName = name
        var schemaIndex = name.indexOf('.')
        if (schemaIndex > 0) {
          schemaName = name.substr(0, schemaIndex)
          unqualifiedTableName = name.substr(schemaIndex + 1)
        }
        sql = sql.replace(/<user_type_name>/g, unqualifiedTableName)
        sql = sql.replace(/<schema_name>/g, schemaName)
        return sql
      }

      sqlMeta.getUserType(this, name, mapFn, function (err, res) {
        if (!err) {
          callback(err, new userTypes.Table(name, res))
        } else {
          callback(err, null)
        }
      })
    }

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

      // require only callback
      if (typeof immediately === 'function') {
        callback = immediately
      } else if (typeof immediately !== 'boolean' && immediately !== undefined) {
        throw new Error('[msnodesql] Invalid parameters passed to close.')
      }

      callback = callback || defaultCallback

      dead = true
      driverMgr.close(function onClose (err) {
        setImmediate(function () {
          driverMgr.emptyQueue()
          callback(err)
        })
      })
    }

    function queryRawNotify (notify, queryOrObj, chunky) {
      var queryObj = notifier.validateQuery(queryOrObj, useUTC, 'queryRaw')
      driverMgr.readAllQuery(notify, queryObj, chunky.params, chunky.callback)
    }

    function queryNotify (notify, queryOrObj, chunky) {
      notifier.validateQuery(queryOrObj, useUTC, 'query')

      function onQueryRaw (err, results, more) {
        if (chunky.callback) {
          if (err) {
            chunky.callback(err, null, more)
          } else {
            chunky.callback(err, driverMgr.objectify(results), more)
          }
        }
      }

      if (chunky.callback) {
        return queryRawNotify(notify, queryOrObj, notifier.getChunkyArgs(chunky.params, function (err, results, more) {
          setImmediate(function () {
            onQueryRaw(err, results, more)
          })
        }))
      } else {
        queryRawNotify(notify, queryOrObj, chunky)
      }
    }

    function queryRaw (queryOrObj, paramsOrCallback, callback) {
      if (dead) {
        throw new Error('[msnodesql] Connection is closed.')
      }

      var notify = new notifier.StreamEvents()
      notify.setConn(this)
      notify.setQueryObj(queryOrObj)
      var chunky = notifier.getChunkyArgs(paramsOrCallback, callback)
      if (!chunky.callback) {
        queryRawNotify(notify, queryOrObj, chunky)
      } else {
        queryRawNotify(notify, queryOrObj, notifier.getChunkyArgs(chunky.params, function (err, results, more) {
          setImmediate(function () {
            chunky.callback(err, results, more)
          })
        }))
      }
      return notify
    }

    function query (queryOrObj, paramsOrCallback, callback) {
      if (dead) {
        throw new Error('[msnodesql] Connection is closed.')
      }

      var notify = new notifier.StreamEvents()
      notify.setConn(this)
      notify.setQueryObj(queryOrObj)
      var chunky = notifier.getChunkyArgs(paramsOrCallback, callback)
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

    function PreparedStatement (preparedSignature, connection, preparedNotifier, preparedMeta) {
      var meta = preparedMeta
      var notify = preparedNotifier
      var cw = connection
      var active = true
      var signature = preparedSignature

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
        var chunky = notifier.getChunkyArgs(paramsOrCallback, callback)

        function onPreparedQuery (err, results, more) {
          if (chunky.callback) {
            if (err) {
              chunky.callback(err)
            } else {
              chunky.callback(err, driverMgr.objectify(results), more)
            }
          }
        }

        if (chunky.callback) {
          driverMgr.readAllPrepared(notify, {}, chunky.params, onPreparedQuery)
        } else {
          driverMgr.readAllPrepared(notify, {}, chunky.params)
        }

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
      var notify = new notifier.StreamEvents()
      notify.setConn(this)
      notify.setQueryObj(queryOrObj)
      var chunky = notifier.getChunkyArgs(callback)
      queryOrObj = notifier.validateQuery(queryOrObj, useUTC, 'prepare')

      function onPrepare (err, meta) {
        var prepared = new PreparedStatement(queryOrObj.query_str, inst, notify, meta)
        chunky.callback(err, prepared)
      }

      driverMgr.prepare(notify, queryOrObj, onPrepare)

      return notify
    }

    var publicApi = {
      id: id,
      getUserTypeTable: getUserTypeTable,
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

    t = new tableModule.TableMgr(publicApi, sqlMeta, userTypes)
    p = new procedureModule.ProcedureMgr(publicApi, notifier, driverMgr, sqlMeta)

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
    function PrivateConnection (p, cb, id) {
      function defaultCallback (err) {
        if (err) {
          throw new Error(err)
        }
      }

      var callback2 = cb
      var native = new cppDriver.Connection()
      var driverMgr = new driverModule.DriverMgr(native)
      var nf = new notifyModule.NotifyFactory()
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
            if (Array.isArray(err) && err.length === 1) {
              callback2(err[0], connection)
            } else {
              callback2(err, connection)
            }
          })
        }

        native.open(connectObj, queueCb)
      }

      this.id = connection.id
      this.connection = connection
      this.open = open

      return this
    }

    var c = new PrivateConnection(getConnectObject(params), callback, nextID)
    nextID += 1
    c.open()

    return c.connection
  }

  function queryCloseOnDone (fn, action, connectDetails, queryOrObj, paramsOrCallback, callback) {
    var thisConn
    var nf = new notifyModule.NotifyFactory()
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

  return {
    meta: sqlMeta,
    userTypes: userTypes,
    query: query,
    queryRaw: queryRaw,
    open: open
  }
}())

exports.connectionModule = connectionModule
