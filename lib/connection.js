/**
 * Created by Stephen on 9/28/2015.
 */

'use strict'

const connectionModule = (() => {
  // private
  const util = require('util')
  const { driverModule } = require('./driver')
  const { procedureModule } = require('./procedure')
  const { notifyModule } = require('./notifier')
  const { tableModule } = require('./table')
  const { userModule } = require('./user')
  const { metaModule } = require('./meta')
  const { utilModule } = require('./util')
  const cppDriver = new utilModule.Native().cppDriver

  const sqlMeta = new metaModule.Meta()
  const userTypes = new userModule.SqlTypes()

  class BasePromises {
    op (f) {
      return new Promise((resolve, reject) => {
        try {
          f((err, v) => {
            if (err) {
              setImmediate(() => reject(err))
            } else {
              setImmediate(() => resolve(v))
            }
          })
        } catch (e) {
          setImmediate(() => reject(e))
        }
      })
    }
  }

  class PreparedStatementPromises extends BasePromises {
    query (params, options) {
      const q = this.prepared.preparedQuery(params)
      return this.aggregator.queryPrepared(q, options)
    }

    free () {
      return this.op(() => this.prepared.free())
    }

    constructor (c, ps) {
      super()
      this.aggregator = new utilModule.QueryAggregator(c)
      this.connection = c
      this.prepared = ps
    }
  }

  class PreparedStatement {
    constructor (notifier, driverMgr, preparedSignature, connection, preparedNotifier, preparedMeta) {
      this.notifier = notifier
      this.driverMgr = driverMgr
      this.connection = connection
      this.meta = preparedMeta
      this.notify = preparedNotifier
      this.active = true
      this.signature = preparedSignature
      this.promises = new PreparedStatementPromises(connection, this)
    }

    getMeta () {
      return this.meta
    }

    getSignature () {
      return this.signature
    }

    getId () {
      return this.notify.getQueryId()
    }

    preparedQuery (paramsOrCallback, callback) {
      if (!this.active) {
        if (callback) {
          callback(new Error('error; prepared statement has been Debugd.'))
        }
      }
      const chunky = this.notifier.getChunkyArgs(paramsOrCallback, callback)

      const onPreparedQuery = (err, results, more) => {
        if (chunky.callback) {
          if (err) {
            chunky.callback(err)
          } else {
            chunky.callback(err, this.driverMgr.objectify(results), more)
          }
        }
      }

      if (chunky.callback) {
        this.driverMgr.readAllPrepared(this.notify, {}, chunky.params, onPreparedQuery)
      } else {
        this.driverMgr.readAllPrepared(this.notify, {}, chunky.params)
      }

      return this.notify
    }

    free (callback) {
      this.driverMgr.freeStatement(this.notify, err => {
        this.active = false
        if (callback) {
          callback(err, null)
        }
      })
    }
  }

  class PrivateConnection {
    constructor (parentFn, p, cb, id) {
      this.parentFn = parentFn
      this.callback2 = cb
      this.native = new cppDriver.Connection()
      this.driverMgr = new driverModule.DriverMgr(this.native)
      this.nf = new notifyModule.NotifyFactory()
      this.connection = new ConnectionWrapper(this.driverMgr, this.defaultCallback, id)
      this.connection.setUseUTC(true)
      this.connectObj = p
      this.version = this.decodeSqlServerVersion(this.connectObj.conn_str)
      this.connection.setDriverVersion(this.version)
      this.id = this.connection.id
    }

    defaultCallback (err) {
      if (err) {
        throw new Error(err)
      }
    }

    queueCb (err) {
      setImmediate(() => {
        if (Array.isArray(err) && err.length === 1) {
          this.callback2(err[0], this.connection)
        } else {
          this.callback2(err, this.connection)
        }
      })
    }

    validationParams () {
      return [
        {
          type: 'string',
          value: this.connectObj.conn_str,
          name: 'connection string'
        },
        {
          type: 'function',
          value: this.callback2,
          name: 'callback'
        }
      ]
    }

    open () {
      this.nf.validateParameters(this.validationParams(), this.parentFn)
      this.callback2 = this.callback2 || this.defaultCallback
      this.native.open(this.connectObj, (e, c) => this.queueCb(e, c))
    }

    decodeSqlServerVersion (connectionString) {
      const myRegexp = /Driver=\{ODBC Driver (.*?) for SQL Server}.*$/g
      const match = myRegexp.exec(connectionString)
      return match !== null ? parseInt(match[1]) : 17
    }
  }

  class ConnectionWrapperPromises extends BasePromises {
    constructor (connection) {
      super()
      this.connection = connection
      this.me = this
      const tm = connection.tableMgr()
      const pm = connection.procedureMgr()
      this.aggregator = new utilModule.QueryAggregator(connection)
      this.query = this.aggregator.query
      this.callProc = this.aggregator.callProc
      this.getTable = tm.promises.getTable
      this.getProc = util.promisify(pm.getProc)
    }

    getUserTypeTable (type) {
      return this.op(cb => this.connection.getUserTypeTable(type, cb))
    }

    cancel (q) {
      return this.op(cb => this.connection.cancel(q, cb))
    }

    close () {
      return this.op(cb => this.connection.close(cb))
    }

    prepare (sqlQuery) {
      return this.op(() => this.connection.prepare(sqlQuery))
    }

    beginTransaction () {
      return this.op(() => this.connection.beginTransaction())
    }

    commit () {
      return this.op(() => this.connection.commit())
    }

    rollback () {
      return this.op(() => this.connection.rollback())
    }
  }

  class ConnectionWrapper {
    constructor (driver, defCb, name) {
      this.defaultCallback = defCb
      this.id = name
      this.driverMgr = driver
      this.inst = this
      this.notifier = new notifyModule.NotifyFactory()
      this.nextQueryId = 0
      this.dead = false
      this.useUTC = true
      this.driverVersion = 0
      this.maxPreparedColumnSize = null
      this.useNumericString = false
      this.procedureCache = null
      this.tableCache = null
      this.tables = new tableModule.TableMgr(this, sqlMeta, userTypes, this.tableCache)
      this.procedures = new procedureModule.ProcedureMgr(this, this.notifier, this.driverMgr, sqlMeta, this.procedureCache)
      this.promises = new ConnectionWrapperPromises(this)
    }

    setSharedCache (pc, tc) {
      this.procedureCache = pc
      this.tableCache = tc
    }

    getUserTypeTable (name, callback) {
      return this.tables.getUserTypeTable(name, callback)
    }

    tableMgr () {
      return this.tables
    }

    getMaxPreparedColumnSize () {
      return this.maxPreparedColumnSize
    }

    setMaxPreparedColumnSize (m) {
      this.maxPreparedColumnSize = m
    }

    getUseUTC () {
      return this.useUTC
    }

    setDriverVersion (v) {
      this.driverVersion = v
      if (this.driverVersion > 0) {
        this.tables.setBcpVersion(this.driverVersion)
      }
    }

    getDriverVersion () {
      return this.driverVersion
    }

    setUseUTC (utc) {
      this.useUTC = utc
      this.driverMgr.setUseUTC(utc)
    }

    getUseNumericString () {
      return this.useNumericString
    }

    setUseNumericString (uns) {
      this.useNumericString = uns
    }

    procedureMgr () {
      return this.procedures
    }

    isClosed () {
      return this.dead
    }

    close (immediately, callback) {
      if (this.dead) {
        return
      }

      // require only callback
      if (typeof immediately === 'function') {
        callback = immediately
      } else if (typeof immediately !== 'boolean' && immediately !== undefined) {
        throw new Error('[msnodesql] Invalid parameters passed to close.')
      }

      callback = callback || this.defaultCallback

      this.dead = true
      this.driverMgr.close(err => {
        setImmediate(() => {
          this.driverMgr.emptyQueue()
          callback(err, null)
        })
      })
    }

    queryRawNotify (notify, queryOrObj, chunky) {
      const queryObj = this.notifier.validateQuery(queryOrObj, this.useUTC, 'queryRaw')
      if (!Object.hasOwnProperty.call(queryObj, 'numeric_string')) {
        queryObj.numeric_string = this.useNumericString
      }
      this.driverMgr.readAllQuery(notify, queryObj, chunky.params, chunky.callback)
    }

    queryNotify (notify, queryOrObj, chunky) {
      this.notifier.validateQuery(queryOrObj, this.useUTC, 'query')

      const onQueryRaw = (err, results, more) => {
        if (chunky.callback) {
          if (err) {
            chunky.callback(err, null, more)
          } else {
            chunky.callback(err, this.driverMgr.objectify(results), more)
          }
        }
      }

      if (chunky.callback) {
        return this.queryRawNotify(notify, queryOrObj, this.notifier.getChunkyArgs(chunky.params, (err, results, more) => {
          setImmediate(() => {
            onQueryRaw(err, results, more)
          })
        }))
      } else {
        this.queryRawNotify(notify, queryOrObj, chunky)
      }
    }

    getNotify (queryOrObj) {
      const qid = this.nextQueryId++
      const notify = new this.notifier.StreamEvents()
      notify.setQueryId(qid)
      notify.setConn(this.inst)
      notify.setQueryObj(queryOrObj)
      return notify
    }

    queryRaw (queryOrObj, paramsOrCallback, callback) {
      if (this.dead) {
        throw new Error('[msnodesql] Connection is closed.')
      }

      const notify = this.getNotify(queryOrObj)
      const chunky = this.notifier.getChunkyArgs(paramsOrCallback, callback)
      if (!chunky.callback) {
        this.queryRawNotify(notify, queryOrObj, chunky)
      } else {
        this.queryRawNotify(notify, queryOrObj, this.notifier.getChunkyArgs(chunky.params, (err, results, more) => {
          setImmediate(() => {
            chunky.callback(err, results, more)
          })
        }))
      }
      return notify
    }

    query (queryOrObj, paramsOrCallback, callback) {
      if (this.dead) {
        throw new Error('[msnodesql] Connection is closed.')
      }
      const notify = this.getNotify(queryOrObj)
      const chunky = this.notifier.getChunkyArgs(paramsOrCallback, callback)
      this.queryNotify(notify, queryOrObj, chunky)
      return notify
    }

    beginTransaction (callback) {
      if (this.dead) {
        throw new Error('[msnodesql] Connection is closed.')
      }
      callback = callback || this.defaultCallback
      this.driverMgr.beginTransaction(callback)
    }

    cancelQuery (notify, callback) {
      if (this.dead) {
        throw new Error('[msnodesql] Connection is closed.')
      }

      const qo = notify.getQueryObj()
      const polling = qo.query_polling || false
      callback = callback || this.defaultCallback
      const paused = notify.isPaused()
      const canCancel = paused || polling
      if (!canCancel) {
        setImmediate(() => {
          callback(new Error('Error: [msnodesql] cancel only supported for statements where polling is enabled.'))
        })
      } else {
        this.driverMgr.cancel(notify, (e) => {
          notify.emit('done')
          callback(e, null)
        })
      }
    }

    commit (callback) {
      if (this.dead) {
        throw new Error('[msnodesql] Connection is closed.')
      }

      callback = callback || this.defaultCallback

      this.driverMgr.commit(callback)
    }

    rollback (callback) {
      if (this.dead) {
        throw new Error('[msnodesql] Connection is closed.')
      }

      callback = callback || this.defaultCallback
      this.driverMgr.rollback(callback)
    }

    // inform driver to prepare the sql statement and reserve it for repeated use with parameters.

    prepare (queryOrObj, callback) {
      const notify = this.getNotify(queryOrObj)
      notify.setPrepared()
      const chunky = this.notifier.getChunkyArgs(callback)
      const queryObj = this.notifier.validateQuery(queryOrObj, this.useUTC, 'prepare')

      if (!Object.hasOwnProperty.call(queryObj, 'numeric_string')) {
        queryObj.numeric_string = this.useNumericString
      }
      if (!Object.hasOwnProperty.call(queryObj, 'max_prepared_column_size')) {
        if (this.maxPreparedColumnSize) {
          queryObj.max_prepared_column_size = this.maxPreparedColumnSize
        }
      }

      const onPrepare = (err, meta) => {
        const prepared = new PreparedStatement(this.notifier, this.driverMgr, queryObj.query_str, this.inst, notify, meta)
        chunky.callback(err, prepared)
      }

      this.driverMgr.prepare(notify, queryObj, onPrepare)

      return notify
    }

    callproc (name, paramsOrCb, cb) {
      return this.procedures.callproc(name, paramsOrCb, cb)
    }

    getTable (name, cb) {
      return this.tables.getTable(name, cb)
    }

    // returns a promise of aggregated results not a query
    callprocAggregator (name, params, options) {
      return this.promises.callProc(name, params, options)
    }
  }

  class SqlClientPromises extends BasePromises {
    constructor (client) {
      super()
      this.client = client
    }

    open (sqlStr) {
      return this.op(cb => this.client.open(sqlStr, cb))
    }

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
  }

  class SqlClient {
    constructor () {
      this.nextID = 0
      this.promises = new SqlClientPromises(this)
      this.meta = sqlMeta
      this.userTypes = userTypes
    }

    queryCloseOnDone (fn, action, connectDetails, queryOrObj, paramsOrCallback, callback) {
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
      this.openFrom(fn, connectDetails, go)
      return notify
    }

    getConnectObject (p) {
      return typeof p === 'string'
        ? {
            conn_str: p,
            connect_timeout: 0
          }
        : p
    }

    openFrom (parentFn, params, callback) {
      const c = new PrivateConnection(parentFn, this.getConnectObject(params), callback, this.nextID)
      this.nextID += 1
      c.open()

      return c.connection
    }

    query (connectDetails, queryOrObj, paramsOrCallback, callback) {
      return this.queryCloseOnDone('query', (conn, notify, args) => conn.queryNotify(notify, queryOrObj, args), connectDetails, queryOrObj, paramsOrCallback, callback)
    }

    queryRaw (connectDetails, queryOrObj, paramsOrCallback, callback) {
      return this.queryCloseOnDone('queryRaw', (conn, notify, args) => conn.queryRawNotify(notify, queryOrObj, args), connectDetails, queryOrObj, paramsOrCallback, callback)
    }

    open (params, callback) {
      return this.openFrom('open', params, callback)
    }
  }

  const client = new SqlClient()
  return client
})()

exports.connectionModule = connectionModule
