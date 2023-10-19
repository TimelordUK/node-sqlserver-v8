/**
 * Created by Stephen on 9/27/2015.
 */

'use strict'

const procedureModule = ((() => {
  const { BasePromises } = require('./base-promises')
  const { ProcedureBound } = require('./procedure-bound')
  const { ProcedureParamFactory } = require('./procedure-meta')

  class ProcedureMgrPromises extends BasePromises {
    constructor (pm) {
      super()
      this.pm = pm
    }

    async getProc (name) {
      return this.op(cb => this.pm.getProc(name, cb))
    }
  }

  class ProcedureMgr {
    constructor (procedureConnection, procedureNotifier, procedureDriverMgr, metaResolver, sharedCache) {
      this.metaResolver = metaResolver
      this.cache = sharedCache || {}
      this.conn = procedureConnection
      this.timeout = 0
      this.polling = false
      this.driverMgr = procedureDriverMgr
      this.notifier = procedureNotifier
      this.paramFactory = new ProcedureParamFactory()
      this.makeParam = this.paramFactory.makeParam
      this.promises = new ProcedureMgrPromises(this)
    }

    mapFn (sql, procedureName) {
      let schemaName = 'dbo'
      let unqualifiedTableName = procedureName
      const schemaIndex = procedureName.indexOf('.')
      if (schemaIndex > 0) {
        schemaName = procedureName.substring(0, schemaIndex)
        unqualifiedTableName = procedureName.substring(schemaIndex + 1)
      }
      sql = sql.replace(/<escaped_procedure_name>/g, unqualifiedTableName)
      sql = sql.replace(/<schema_name>/g, schemaName)
      return sql
    }

    describeProcedure (procedureName, callback) {
      this.metaResolver.getProcedureDefinition(this.conn, procedureName, sql => this.mapFn(sql, procedureName))
        .then(results => {
          if (results.length > 0) {
            const ret = this.paramFactory.returnParam()
            results.unshift(ret)
          }
          callback(null, results)
        }).catch(err => {
          callback(err, null)
        })
    }

    addProc (name, paramVector) {
      if (paramVector.length === 0 || paramVector[0].name !== '@returns') {
        const retMeta = this.paramFactory.returnParam()
        paramVector.unshift(retMeta)
      }

      const procedure = new ProcedureBound(this.driverMgr, this.notifier, this.conn, paramVector, name, this.polling, this.timeout)
      this.cache[name] = procedure
      return procedure
    }

    createProcedure (name, cb) {
      let procedure = this.cache[name]
      if (!procedure) {
        this.describeProcedure(name, (err, paramVector) => {
          if (!err) {
            procedure = this.addProc(name, paramVector)
            cb(null, procedure)
          } else {
            cb(err, null)
          }
        })
      } else {
        cb(null, procedure)
      }
    }

    describe (name, cb) {
      this.createProcedure(name, p => {
        if (p) {
          cb(p)
        } else {
          cb(new Error(`could not get definition of ${name}`))
        }
      })
    }

    getProc (name, cb) {
      this.createProcedure(name, (err, p) => {
        cb(err, p)
      })
    }

    get (name, cb) {
      this.createProcedure(name, (err, p) => {
        if (err) {
          cb(err)
        } else {
          cb(p)
        }
      })
    }

    callproc (name, paramsOrCb, cb) {
      const notify = this.conn.getNotify(paramsOrCb)
      this.createProcedure(name, (e, p) => {
        if (e) {
          const err = new Error(`unable to construct proc ${name} ${e.message}`)
          if (cb) {
            cb(err, null, null)
          } else {
            notify.emit('error', err)
          }
        } else {
          p.callNotify(paramsOrCb, cb, notify)
        }
      })
      return notify
    }

    setTimeout (t) {
      this.timeout = t
    }

    clear () {
      Object.keys(this.cache).forEach(k => {
        delete this.cache[k]
      })
    }

    setPolling (b) {
      this.polling = b
    }

    getCount () {
      return Object.keys(this.cache).length
    }
  }

  return {
    ProcedureMgr
  }
})())

exports.procedureModule = procedureModule
