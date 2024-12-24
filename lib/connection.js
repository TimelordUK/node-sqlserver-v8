/**
 * Created by Stephen on 9/28/2015.
 */

'use strict'

// private
const { driverModule } = require('./driver')
const { procedureModule } = require('./procedure')
const { notifyModule } = require('./notifier')
const { tableModule } = require('./table')
const { utilModule } = require('./util')
const { BasePromises } = require('./base-promises')
const { PreparedStatement } = require('./prepared-statement')
const cppDriver = new utilModule.Native().cppDriver

class PrivateConnection {
  constructor (sqlMeta, userTypes, parentFn, p, cb, id) {
    this.parentFn = parentFn
    this.callback2 = cb
    this.native = new cppDriver.Connection()
    this.driverMgr = new driverModule.DriverMgr(this.native)
    this.nf = new notifyModule.NotifyFactory()
    this.connection = new ConnectionWrapper(sqlMeta, userTypes, this.driverMgr, this.defaultCallback, id)
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
      new this.nf.LexicalParam('string', this.connectObj.conn_str, 'connection string'),
      new this.nf.LexicalParam('function', this.callback2, 'callback')
    ]
  }

  open () {
    this.nf.validateParameters(this.validationParams(), this.parentFn)
    //
    this.callback2 = this.callback2 || this.defaultCallback
    this.native.open(this.connectObj, (e, c) => { this.queueCb(e, c) })
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
    this.tm = connection.tableMgr()
    this.pm = connection.procedureMgr()
    this.aggregator = new utilModule.QueryAggregator(connection)
  }

  async callProc (name, params, options) {
    return this.aggregator.callProc(name, params, options)
  }

  async query (sql, params, options) {
    return this.aggregator.query(sql, params, options)
  }

  async getTable (name) {
    return this.op(cb => this.tm.getTable(name, cb))
  }

  async getProc (name) {
    return this.op(cb => this.pm.getProc(name, cb))
  }

  async getUserTypeTable (type) {
    return this.op(cb => this.connection.getUserTypeTable(type, cb))
  }

  async cancel (q) {
    return this.op(cb => this.connection.cancel(q, cb))
  }

  async close () {
    return this.op(cb => this.connection.close(cb))
  }

  async prepare (sqlQuery) {
    return this.op(cb => this.connection.prepare(sqlQuery, cb))
  }

  async beginTransaction () {
    return this.op(cb => this.connection.beginTransaction(cb))
  }

  async commit () {
    return this.op(cb => this.connection.commit(cb))
  }

  async rollback () {
    return this.op(cb => this.connection.rollback(cb))
  }
}

class ConnectionWrapper {
  constructor (sqlMeta, userTypes, driver, defCb, name) {
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
    this.tables.getUserTypeTable(name, callback)
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
      this.queryRawNotify(notify, queryOrObj, this.notifier.getChunkyArgs(chunky.params, (err, results, more) => {
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
    this.tables.getTable(name, cb)
  }

  // returns a promise of aggregated results not a query
  async callprocAggregator (name, params, options) {
    return this.promises.callProc(name, params, options)
  }
}

exports.PrivateConnection = PrivateConnection
