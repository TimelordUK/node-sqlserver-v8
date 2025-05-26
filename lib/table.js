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
  const { BasePromises } = require('./base-promises')
  const { ServerDialect } = require('./dialect')
  const { TableBulkOpMgr } = require('./table-bulk-op-mgr')
  const { TableMeta } = require('./table-meta')
  const { TableColumn } = require('./table-column')
  const { TableBuilder } = require('./table-builder')
  const userModule = require('./user').userModule
  const utilModule = require('./util').utilModule
  const userTypes = new userModule.SqlTypes()
  const splitter = new utilModule.SchemaSplitter()

  class TableMgrPromises extends BasePromises {
    constructor (tm) {
      super()
      this.tm = tm
    }

    async getTable (name) {
      return this.op(cb => this.tm.getTable(name, cb))
    }

    async getUserTypeTable (name) {
      return this.op(cb => this.tm.getUserTypeTable(name, cb))
    }
  }

  class TableMgr {
    constructor (connection, connectionMeta, connectionUser, sharedCache) {
      this.cache = sharedCache || {}
      this.bulkTableManagers = {}
      this.theConnection = connection
      this.metaResolver = connectionMeta
      this.user = connectionUser
      this.bcpVersion = 0
      this.promises = new TableMgrPromises(this)
      this.ServerDialect = {
        Sybase: ServerDialect.Sybase,
        SqlServer: ServerDialect.SqlServer
      }
    }

    setBcpVersion (v) {
      this.bcpVersion = v
    }

    getBcpVersion () {
      return this.bcpVersion
    }

    getUserTypeTable (name, callback) {
      const mapFn = sql => {
        const decomp = splitter.decomposeSchema(name, '')
        decomp.schema = decomp.schema || 'dbo'
        return splitter.substitute(sql, decomp)
      }

      this.metaResolver.getUserType(this.theConnection, name, mapFn).then(res => {
        callback(null, new userTypes.Table(name, res))
      }).catch(err => {
        callback(err, null)
      })
    }

    async describeTable (tableName) {
      const resolver = this.metaResolver
      return new Promise((resolve, reject) => {
        resolver.getServerVersionRes(this.theConnection).then(res => {
          const cat = `[${res[0].Cat}]`
          function mapFn (data) {
            const decomp = splitter.decomposeSchema(tableName, cat)
            return splitter.substitute(data, decomp)
          }

          resolver.getTableDefinition(this.theConnection, res[0].MajorVersion, mapFn).then(res => {
            resolve(res)
          }).catch(err => {
            reject(err)
          })
        }).catch(err => {
          reject(err)
        })
      })
    }

    makeColumn (tableName, tableSchema, position, columnName, columnType, maxLength, isPrimaryKey) {
      return new TableColumn(tableName, tableSchema, position, columnName, columnType, maxLength, isPrimaryKey)
    }

    addMeta (tableName, columns, dialect) {
      const tableMeta = new TableMeta(tableName, columns, dialect)
      this.cache[tableMeta] = tableMeta
      return tableMeta
    }

    addTable (tableName, columns, dialect) {
      const meta = this.addMeta(tableName, columns, dialect)
      return this.getBulk(tableName, meta)
    }

    makeBuilder (tableName, tableCatelog, tableSchema) {
      return new TableBuilder(this, this.theConnection, tableName, tableCatelog, tableSchema)
    }

    /*
     based on an instance bind properties of that instance to a given table.
     Will have to allow for not all properties binding i.e. may be partial persistence - and allow for
     mappings i.e. object.myName = table.<name> or table.my_name etc.
     */

    async describe (name) {
      return new Promise((resolve, reject) => {
        let tableMeta = this.cache[name]
        if (!tableMeta) {
          this.describeTable(name).then(rawCols => {
            // console.log(JSON.stringify(rawCols, null, 4))
            const tps = rawCols.map(rc => TableColumn.asTableColumn(rc))
            tableMeta = this.addMeta(name, tps)
            resolve(tableMeta)
          }).catch(err => {
            reject(err)
          })
        } else {
          resolve(tableMeta)
        }
      })
    }

    getBulk (table, meta) {
      let bulkMgr = this.bulkTableManagers[table]
      if (!bulkMgr) {
        bulkMgr = new TableBulkOpMgr(this.theConnection, this.user, meta)
        if (this.bcpVersion > 0) {
          bulkMgr.setBcpVersion(this.bcpVersion)
        }
        this.bulkTableManagers[table] = bulkMgr
      }
      return bulkMgr
    }

    // promise safe (err, table)
    getTable (table, cb) {
      this.describe(table).then(meta => {
        const bulkMgr = this.getBulk(table, meta)
        cb(null, bulkMgr)
      }).catch(err => {
        cb(err, null)
      })
    }

    // (table)
    bind (table, cb) {
      this.describe(table).then(meta => {
        const bulkMgr = this.getBulk(table, meta)
        cb(bulkMgr)
      }).catch(err => {
        cb(null, err)
      })
    }
  }

  return {
    TableMgr
  }
})()

exports.tableModule = tableModule
