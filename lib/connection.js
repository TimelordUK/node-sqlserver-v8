/**
 * Created by Stephen on 9/28/2015.
 */

'use strict'

const connectionModule = ((() => {
  // private
  const util = require('util')
  const cppDriver = require('../build/Release/sqlserverv8.node')
  const { driverModule } = require('./driver')
  const { procedureModule } = require('./procedure')
  const { notifyModule } = require('./notifier')
  const { tableModule } = require('./table')
  const { userModule } = require('./user')
  const { metaModule } = require('./meta')
  const { utilModule } = require('./util')

  const sqlMeta = new metaModule.Meta()
  const userTypes = new userModule.SqlTypes()

  class PreparedStatementPromises {
    query (params, options) {
      const q = this.prepared.preparedQuery(params)
      return this.aggregator.queryPrepared(q, options)
    }

    constructor (c, ps) {
      this.aggregator = new utilModule.QueryAggregator(c)
      this.connection = c
      this.prepared = ps
      this.free = util.promisify(ps.free)
    }
  }

  class PreparedStatement {
    constructor (notifier, driverMgr, preparedSignature, connection, preparedNotifier, preparedMeta) {
      const meta = preparedMeta
      const notify = preparedNotifier

      let active = true
      const signature = preparedSignature

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
            callback(new Error('error; prepared statement has been Debugd.'))
          }
        }
        const chunky = notifier.getChunkyArgs(paramsOrCallback, callback)

        const onPreparedQuery = (err, results, more) => {
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

      const free = callback => {
        driverMgr.freeStatement(notify, err => {
          active = false
          if (callback) {
            callback(err, null)
          }
        })
      }

      this.preparedQuery = preparedQuery
      this.meta = meta
      this.connection = connection
      this.free = free
      this.getMeta = getMeta
      this.getSignature = getSignature
      this.getId = getId
      this.promises = new PreparedStatementPromises(connection, this)

      return this
    }
  }

  class PrivateConnection {
    constructor (parentFn, p, cb, id) {
      const defaultCallback = err => {
        if (err) {
          throw new Error(err)
        }
      }

      let callback2 = cb
      const native = new cppDriver.Connection()
      const driverMgr = new driverModule.DriverMgr(native)
      const nf = new notifyModule.NotifyFactory()
      const connection = new ConnectionWrapper(driverMgr, defaultCallback, id)
      connection.setUseUTC(true)
      const connectObj = p
      const version = this.decodeSqlServerVersion(connectObj.conn_str)
      connection.setDriverVersion(version)

      const open = () => {
        nf.validateParameters(
          [
            {
              type: 'string',
              value: connectObj.conn_str,
              name: 'connection string'
            },
            {
              type: 'function',
              value: cb,
              name: 'callback'
            }
          ],
          parentFn
        )

        callback2 = callback2 || defaultCallback

        const queueCb = err => {
          setImmediate(() => {
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

    decodeSqlServerVersion (connectionString) {
      const myRegexp = /Driver=\{ODBC Driver (.*?) for SQL Server}.*$/g
      const match = myRegexp.exec(connectionString)
      return match !== null ? parseInt(match[1]) : 17
    }
  }

  class ConnectionWrapperPromises {
    constructor (connection) {
      function prepare (sqlQuery) {
        const inst = this
        return new Promise((resolve, reject) => {
          inst.connection.prepare(sqlQuery, (err, res) => {
            if (err) {
              setImmediate(() => {
                reject(err)
              })
            } else {
              setImmediate(() => {
                resolve(res)
              })
            }
          })
        })
      }

      function beginTransaction () {
        const inst = this
        return new Promise((resolve, reject) => {
          inst.connection.beginTransaction((err, res) => {
            if (err) {
              setImmediate(() => {
                reject(err)
              })
            } else {
              setImmediate(() => {
                resolve(res)
              })
            }
          })
        })
      }

      function commit () {
        const inst = this
        return new Promise((resolve, reject) => {
          inst.connection.commit((err, res) => {
            if (err) {
              setImmediate(() => {
                reject(err)
              })
            } else {
              setImmediate(() => {
                resolve(res)
              })
            }
          })
        })
      }

      function rollback () {
        const inst = this
        return new Promise((resolve, reject) => {
          inst.connection.rollback((err, res) => {
            if (err) {
              setImmediate(() => {
                reject(err)
              })
            } else {
              setImmediate(() => {
                resolve(res)
              })
            }
          })
        })
      }

      this.me = this
      this.beginTransaction = beginTransaction
      this.commit = commit
      this.rollback = rollback
      this.prepare = prepare
      this.connection = connection
      const tm = connection.tableMgr()
      const pm = connection.procedureMgr()
      this.aggregator = new utilModule.QueryAggregator(connection)
      this.query = this.aggregator.query
      this.callProc = this.aggregator.callProc
      this.getUserTypeTable = util.promisify(connection.getUserTypeTable)
      this.getTable = tm.promises.getTable
      this.getProc = util.promisify(pm.getProc)
      this.close = util.promisify(connection.close)
      this.cancel = util.promisify(connection.cancelQuery)
    }
  }

  class ConnectionWrapper {
    constructor (driver, defCb, name) {
      const defaultCallback = defCb
      const id = name
      const driverMgr = driver
      const inst = this
      const notifier = new notifyModule.NotifyFactory()

      let nextQueryId = 0

      let dead = false
      let useUTC = true
      let driverVersion = 0
      let maxPreparedColumnSize = null
      let useNumericString = false
      let procedureCache = null
      let tableCache = null

      function setSharedCache (pc, tc) {
        procedureCache = pc
        tableCache = tc
      }

      function getUserTypeTable (name, callback) {
        return tables.getUserTypeTable(name, callback)
      }

      function tableMgr () {
        return tables
      }

      function getMaxPreparedColumnSize () {
        return maxPreparedColumnSize
      }

      function setMaxPreparedColumnSize (m) {
        maxPreparedColumnSize = m
      }

      function getUseUTC () {
        return useUTC
      }

      function setDriverVersion (v) {
        driverVersion = v
        if (driverVersion > 0) {
          tables.setBcpVersion(driverVersion)
        }
      }

      function getDriverVersion () {
        return driverVersion
      }

      function setUseUTC (utc) {
        useUTC = utc
        driverMgr.setUseUTC(utc)
      }

      function getUseNumericString () {
        return useNumericString
      }

      function setUseNumericString (uns) {
        useNumericString = uns
      }

      function procedureMgr () {
        return procedures
      }

      function isClosed () {
        return dead
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
        driverMgr.close(err => {
          setImmediate(() => {
            driverMgr.emptyQueue()
            callback(err, null)
          })
        })
      }

      function queryRawNotify (notify, queryOrObj, chunky) {
        const queryObj = notifier.validateQuery(queryOrObj, useUTC, 'queryRaw')
        if (!Object.hasOwnProperty.call(queryObj, 'numeric_string')) {
          queryObj.numeric_string = useNumericString
        }
        driverMgr.readAllQuery(notify, queryObj, chunky.params, chunky.callback)
      }

      function queryNotify (notify, queryOrObj, chunky) {
        notifier.validateQuery(queryOrObj, useUTC, 'query')

        const onQueryRaw = (err, results, more) => {
          if (chunky.callback) {
            if (err) {
              chunky.callback(err, null, more)
            } else {
              chunky.callback(err, driverMgr.objectify(results), more)
            }
          }
        }

        if (chunky.callback) {
          return queryRawNotify(notify, queryOrObj, notifier.getChunkyArgs(chunky.params, (err, results, more) => {
            setImmediate(() => {
              onQueryRaw(err, results, more)
            })
          }))
        } else {
          queryRawNotify(notify, queryOrObj, chunky)
        }
      }

      function getNotify (queryOrObj) {
        const qid = nextQueryId++
        const notify = new notifier.StreamEvents()
        notify.setQueryId(qid)
        notify.setConn(inst)
        notify.setQueryObj(queryOrObj)
        return notify
      }

      function queryRaw (queryOrObj, paramsOrCallback, callback) {
        if (dead) {
          throw new Error('[msnodesql] Connection is closed.')
        }

        const notify = getNotify(queryOrObj)
        const chunky = notifier.getChunkyArgs(paramsOrCallback, callback)
        if (!chunky.callback) {
          queryRawNotify(notify, queryOrObj, chunky)
        } else {
          queryRawNotify(notify, queryOrObj, notifier.getChunkyArgs(chunky.params, (err, results, more) => {
            setImmediate(() => {
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
        const notify = getNotify(queryOrObj)
        const chunky = notifier.getChunkyArgs(paramsOrCallback, callback)
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

        const qo = notify.getQueryObj()
        const polling = qo.query_polling || false
        callback = callback || defaultCallback
        const paused = notify.isPaused()
        const canCancel = paused || polling
        if (!canCancel) {
          setImmediate(() => {
            callback(new Error('Error: [msnodesql] cancel only supported for statements where polling is enabled.'))
          })
        } else {
          driverMgr.cancel(notify, (e) => {
            notify.emit('done')
            callback(e, null)
          })
        }
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

      function prepare (queryOrObj, callback) {
        const notify = getNotify(queryOrObj)
        notify.setPrepared()
        const chunky = notifier.getChunkyArgs(callback)
        const queryObj = notifier.validateQuery(queryOrObj, useUTC, 'prepare')

        if (!Object.hasOwnProperty.call(queryObj, 'numeric_string')) {
          queryObj.numeric_string = useNumericString
        }
        if (!Object.hasOwnProperty.call(queryObj, 'max_prepared_column_size')) {
          if (maxPreparedColumnSize) {
            queryObj.max_prepared_column_size = maxPreparedColumnSize
          }
        }

        const onPrepare = (err, meta) => {
          const prepared = new PreparedStatement(notifier, driverMgr, queryObj.query_str, inst, notify, meta)
          chunky.callback(err, prepared)
        }

        driverMgr.prepare(notify, queryObj, onPrepare)

        return notify
      }

      function callproc (name, paramsOrCb, cb) {
        return procedures.callproc(name, paramsOrCb, cb)
      }

      // returns a promise of aggregated results not a query
      function callprocAggregator (name, params, options) {
        return this.promises.callProc(name, params, options)
      }

      this.id = id

      this.setUseNumericString = setUseNumericString
      this.getUseNumericString = getUseNumericString
      this.getUserTypeTable = getUserTypeTable
      this.cancelQuery = cancelQuery
      this.queryNotify = queryNotify
      this.queryRaw = queryRaw
      this.queryRawNotify = queryRawNotify
      this.close = close
      this.query = query
      this.beginTransaction = beginTransaction
      this.commit = commit
      this.rollback = rollback
      this.tableMgr = tableMgr
      this.procedureMgr = procedureMgr
      this.prepare = prepare
      this.getUseUTC = getUseUTC
      this.setUseUTC = setUseUTC
      this.getMaxPreparedColumnSize = getMaxPreparedColumnSize
      this.setMaxPreparedColumnSize = setMaxPreparedColumnSize
      this.getNotify = getNotify
      this.callproc = callproc
      this.callprocAggregator = callprocAggregator
      this.setSharedCache = setSharedCache
      this.isClosed = isClosed
      this.setDriverVersion = setDriverVersion
      this.getDriverVersion = getDriverVersion

      const tables = new tableModule.TableMgr(this, sqlMeta, userTypes, tableCache)
      const procedures = new procedureModule.ProcedureMgr(this, notifier, driverMgr, sqlMeta, procedureCache)
      this.promises = new ConnectionWrapperPromises(this)
    }
  }

  let nextID = 0

  function getConnectObject (p) {
    return typeof (p) === 'string'
      ? {
          conn_str: p,
          connect_timeout: 0
        }
      : p
  }

  function openFrom (parentFn, params, callback) {
    const c = new PrivateConnection(parentFn, getConnectObject(params), callback, nextID)
    nextID += 1
    c.open()

    return c.connection
  }

  function queryCloseOnDone (fn, action, connectDetails, queryOrObj, paramsOrCallback, callback) {
    let thisConn
    const nf = new notifyModule.NotifyFactory()
    const args = nf.getChunkyArgs(paramsOrCallback, callback)
    const notify = new nf.StreamEvents()

    const complete = (err, res, more) => {
      if (!more && thisConn !== null) {
        thisConn.close(() => {
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

    const args2 = {
      params: args.params,
      callback: complete
    }

    const go = (err, conn) => {
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
    return queryCloseOnDone('query', (conn, notify, args) => conn.queryNotify(notify, queryOrObj, args), connectDetails, queryOrObj, paramsOrCallback, callback)
  }

  function queryRaw (connectDetails, queryOrObj, paramsOrCallback, callback) {
    return queryCloseOnDone('queryRaw', (conn, notify, args) => conn.queryRawNotify(notify, queryOrObj, args), connectDetails, queryOrObj, paramsOrCallback, callback)
  }

  function open (params, callback) {
    return openFrom('open', params, callback)
  }

  class SqlPromises {
    query (connStr, sql, params, options) {
      return new Promise((resolve, reject) => {
        this.open(connStr)
          .then(connection => {
            connection.promises.query(sql, params, options)
              .then(results => {
                connection.promises.close()
                  .then(() => {
                    resolve(results)
                  }).catch(err => {
                    reject(err)
                  })
              }).catch(err => {
                reject(err)
              })
          }).catch(err => {
            reject(err)
          })
      })
    }

    callProc (connStr, name, params, options) {
      return new Promise((resolve, reject) => {
        this.open(connStr)
          .then(connection => {
            connection.promises.callProc(name, params, options)
              .then(results => {
                connection.promises.close()
                  .then(() => {
                    resolve(results)
                  }).catch(err => {
                    reject(err)
                  })
              }).catch(err => {
                reject(err)
              })
          }).catch(err => {
            reject(err)
          })
      })
    }

    constructor () {
      this.open = util.promisify(open)
    }
  }

  const promises = new SqlPromises(this)
  return {
    meta: sqlMeta,
    userTypes,
    query,
    queryRaw,
    open,
    promises
  }
})())

exports.connectionModule = connectionModule
