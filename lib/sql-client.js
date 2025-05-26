'use strict'

const { notifyModule } = require('./notifier')
const { PrivateConnection } = require('./connection')
const { metaModule } = require('./meta')
const { userModule } = require('./user')
const { BasePromises } = require('./base-promises')
const sqlMeta = new metaModule.Meta()
const userTypes = new userModule.SqlTypes()

class SqlClientPromises extends BasePromises {
  constructor (client) {
    super()
    this.client = client
  }

  async open (sqlStr) {
    return this.op(cb => this.client.open(sqlStr, cb))
  }

  async query (connStr, sql, params, options) {
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

  async callProc (connStr, name, params, options) {
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
    const c = new PrivateConnection(sqlMeta, userTypes, parentFn, this.getConnectObject(params), callback, this.nextID)
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

const sqlClientModule = (() => {
  return new SqlClient()
})()

exports.sqlCLientModule = sqlClientModule
