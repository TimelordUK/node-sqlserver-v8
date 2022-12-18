/**
 * Created by Stephen on 9/27/2015.
 */

'use strict'

const { ProcedureBound } = require('./procedure-bound')
const procedureModule = ((() => {
  const { ServerDialect } = require('./dialect')

  class ProcedureMgr {
    constructor (procedureConnection, procedureNotifier, procedureDriverMgr, metaResolver, sharedCache) {
      const cache = sharedCache || {}
      const conn = procedureConnection
      let timeout = 0
      let polling = false
      const driverMgr = procedureDriverMgr
      const notifier = procedureNotifier

      function returnMeta () {
        return {
          is_output: true,
          name: '@returns',
          type_id: 'int',
          max_length: 4,
          order: 0,
          is_user_defined: false,
          has_default_value: false,
          default_value: null,
          collation: null
        }
      }

      function describeProcedure (procedureName, callback) {
        const ret = returnMeta()
        function mapFn (sql) {
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

        metaResolver.getProcedureDefinition(conn, procedureName, mapFn).then(results => {
          if (results.length > 0) {
            results.unshift(ret)
          }
          callback(null, results)
        }).catch(err => {
          callback(err, null)
        })
      }

      /*
      {
  proc_name: "test_sp",
  type_desc: "SQL_STORED_PROCEDURE",
  object_id: 1446165539,
  has_default_value: false,
  default_value: null,
  is_output: false,
  name: "@param",
  type_id: "varchar",
  max_length: 50,
  order: 1,
  collation: "SQL_Latin1_General_CP1_CI_AS",
  is_user_defined: null,
}
      */

      function makeParam (procName, paramName, paramType, paramLength, isOutput) {
        return {
          proc_name: procName,
          type_desc: 'SQL_STORED_PROCEDURE',
          object_id: -1,
          has_default_value: false,
          default_value: null,
          is_output: isOutput,
          name: paramName,
          type_id: paramType,
          max_length: paramLength,
          order: 1,
          collation: '',
          is_user_defined: null
        }
      }

      function addProc (name, paramVector) {
        if (paramVector.length === 0 || paramVector[0].name !== '@returns') {
          const retMeta = returnMeta()
          paramVector.unshift(retMeta)
        }

        const procedure = new ProcedureBound(driverMgr, notifier, conn, paramVector, name, polling, timeout)
        cache[name] = procedure
        return procedure
      }

      function createProcedure (name, cb) {
        let procedure = cache[name]
        if (!procedure) {
          describeProcedure(name, (err, paramVector) => {
            if (!err) {
              procedure = addProc(name, paramVector)
              cb(null, procedure)
            } else {
              cb(err, null)
            }
          })
        } else {
          cb(null, procedure)
        }
      }

      function describe (name, cb) {
        createProcedure(name, p => {
          if (p) {
            cb(p)
          } else {
            cb(new Error(`could not get definition of ${name}`))
          }
        })
      }

      function getProc (name, cb) {
        createProcedure(name, (err, p) => {
          cb(err, p)
        })
      }

      function get (name, cb) {
        createProcedure(name, (err, p) => {
          if (err) {
            cb(err)
          } else {
            cb(p)
          }
        })
      }

      function callproc (name, paramsOrCb, cb) {
        const notify = conn.getNotify(paramsOrCb)
        createProcedure(name, (e, p) => {
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

      function setTimeout (t) {
        timeout = t
      }

      function clear () {
        Object.keys(cache).forEach(k => {
          delete cache[k]
        })
      }

      function setPolling (b) {
        polling = b
      }

      function getCount () {
        return Object.keys(cache).length
      }

      this.makeParam = makeParam
      this.setTimeout = setTimeout
      this.setPolling = setPolling
      this.addProc = addProc
      this.callproc = callproc
      this.describe = describe
      this.getCount = getCount
      this.clear = clear
      this.get = get // legacy call
      this.getProc = getProc
      this.ServerDialect = ServerDialect
    }
  }

  return {
    ProcedureMgr
  }
})())

exports.procedureModule = procedureModule
