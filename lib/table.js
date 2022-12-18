/**
 * Created by Stephen on 9/28/2015.
 */

/*
 supports bulk table operations, delete, modify and insert. Also capture table definition such that
 template sql statements can be used to insert single entries.

 this manager will ultimately become the underlying mechanism for simple "entity framework" like
 transactions i.e. working with a concrete JavaScript type that requires efficient binding to
 the database, thus it must be robust and simple to enhance.
 */

'use strict'

const tableModule = (() => {
  const { TableBulkOpMgr } = require('./table-bulk-op-mgr')
  const { TableMeta } = require('./table-meta')
  const { TableColumn } = require('./table-column')
  const { TableBuilder } = require('./table-builder')
  const { ServerDialect } = require('./dialect')
  const util = require('util')
  const userModule = require('./user').userModule
  const utilModule = require('./util').utilModule
  const userTypes = new userModule.SqlTypes()
  const splitter = new utilModule.SchemaSplitter()

  class TableMgrPromises {
    constructor (tm) {
      this.getTable = util.promisify(tm.getTable)
      this.getUserTypeTable = util.promisify(tm.getUserTypeTable)
    }
  }

  class TableMgr {
    constructor (connection, connectionMeta, connectionUser, sharedCache) {
      const cache = sharedCache || {}
      const bulkTableManagers = {}
      const theConnection = connection
      const metaResolver = connectionMeta
      const user = connectionUser
      let bcpVersion = 0

      function setBcpVersion (v) {
        bcpVersion = v
      }

      function getBcpVersion () {
        return bcpVersion
      }

      function getUserTypeTable (name, callback) {
        const mapFn = sql => {
          const decomp = splitter.decomposeSchema(name, '')
          decomp.schema = decomp.schema || 'dbo'
          return splitter.substitute(sql, decomp)
        }

        metaResolver.getUserType(connection, name, mapFn).then(res => {
          callback(null, new userTypes.Table(name, res))
        }).catch(err => {
          callback(err, null)
        })
      }

      function describeTable (tableName) {
        const resolver = metaResolver
        return new Promise((resolve, reject) => {
          resolver.getServerVersionRes(theConnection).then(res => {
            const cat = `[${res[0].Cat}]`
            function mapFn (data) {
              const decomp = splitter.decomposeSchema(tableName, cat)
              return splitter.substitute(data, decomp)
            }

            resolver.getTableDefinition(theConnection, res[0].MajorVersion, mapFn).then(res => {
              resolve(res)
            }).catch(err => {
              reject(err)
            })
          }).catch(err => {
            reject(err)
          })
        })
      }

      function makeColumn (tableName, tableSchema, position, columnName, columnType, maxLength, isPrimaryKey) {
        return new TableColumn(tableName, tableSchema, position, columnName, columnType, maxLength, isPrimaryKey)
      }

      function addMeta (tableName, columns, dialect) {
        const tableMeta = new TableMeta(tableName, columns, dialect)
        cache[tableMeta] = tableMeta
        return tableMeta
      }

      function addTable (tableName, columns, dialect) {
        const meta = addMeta(tableName, columns, dialect)
        return getBulk(tableName, meta)
      }

      function makeBuilder (tableName, tableCatelog, tableSchema) {
        return new TableBuilder(this, theConnection, tableName, tableCatelog, tableSchema)
      }

      /*
     based on an instance bind properties of that instance to a given table.
     Will have to allow for not all properties binding i.e. may be partial persistence - and allow for
     mappings i.e. object.myName = table.<name> or table.my_name etc.
     */

      function describe (name) {
        return new Promise((resolve, reject) => {
          let tableMeta = cache[name]
          if (!tableMeta) {
            describeTable(name).then(rawCols => {
              // console.log(JSON.stringify(rawCols, null, 4))
              const tps = rawCols.map(rc => TableColumn.asTableColumn(rc))
              tableMeta = addMeta(name, tps)
              resolve(tableMeta)
            }).catch(err => {
              reject(err)
            })
          } else {
            resolve(tableMeta)
          }
        })
      }

      function getBulk (table, meta) {
        let bulkMgr = bulkTableManagers[table]
        if (!bulkMgr) {
          bulkMgr = new TableBulkOpMgr(theConnection, user, meta)
          if (bcpVersion > 0) {
            bulkMgr.setBcpVersion(bcpVersion)
          }
          bulkTableManagers[table] = bulkMgr
        }
        return bulkMgr
      }

      // promise safe (err, table)
      function getTable (table, cb) {
        describe(table).then(meta => {
          const bulkMgr = getBulk(table, meta)
          cb(null, bulkMgr)
        }).catch(err => {
          cb(err, null)
        })
      }

      // (table)
      function bind (table, cb) {
        describe(table).then(meta => {
          const bulkMgr = getBulk(table, meta)
          cb(bulkMgr)
        }).catch(err => {
          cb(null, err)
        })
      }

      this.makeBuilder = makeBuilder
      this.addTable = addTable
      this.makeColumn = makeColumn
      this.describe = describe
      this.bind = bind
      this.getTable = getTable
      this.getUserTypeTable = getUserTypeTable
      this.promises = new TableMgrPromises(this)
      this.ServerDialect = ServerDialect
      this.setBcpVersion = setBcpVersion
      this.getBcpVersion = getBcpVersion
    }
  }

  return {
    TableMgr
  }
})()

exports.tableModule = tableModule
