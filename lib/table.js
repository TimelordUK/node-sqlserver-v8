/**
 * Created by Stephen on 9/28/2015.
 */

/*
 supports bulk table operations, delete, modify and insert. Also capture table definition such that
 template sql statements can be used to insert single entries.

 this manager will ultimately become the underlying mechanism for simple "entity framework" like
 transactions i.e. working with a concrete java script type that requires efficient binding to
 the database, thus it must be robust and simple to enhance.
 */

'use strict'

const tableModule = (() => {
  const util = require('util')
  const userModule = require('./user').userModule
  const userTypes = new userModule.SqlTypes()

  class TableMgrPromises {
    constructor (tm) {
      this.getTable = util.promisify(tm.getTable)
    }
  }

  class TableMgr {
    constructor (connection, connectionMeta, connectionUser, sharedCache) {
      const cache = sharedCache || {}
      const bulkTableManagers = {}
      const theConnection = connection
      const metaResolver = connectionMeta
      const user = connectionUser

      function describeTable (tableName) {
        const resolver = metaResolver
        return new Promise((resolve, reject) => {
          resolver.getServerVersionRes(theConnection).then(res => {
            let cat = `[${res[0].Cat}]`
            let sql

            function mapFn (data) {
              const tableParts = tableName.split(/\.(?![^[]*])/g) // Split table names like 'dbo.table1' to: ['dbo', 'table1'] and 'table1' to: ['table1']
              const table = tableParts[tableParts.length - 1] // get the table name
              let fullTableName = table
              const schema = tableParts[tableParts.length - 2] || '' // get the table schema, if missing set schema to ''
              if (tableParts.length > 2) {
                cat = tableParts[tableParts.length - 3]
              } else if (table[0] === '#') {
                cat = '[tempdb]'
                fullTableName = `${cat}.${schema}.${table}`
              }
              sql = data.replace(/<table_name>/g, table.replace(/^\[|]$/g, '').replace(/]]/g, ']')) // removes brackets at start end end, change ']]' to ']'
                .replace(/<table_schema>/g, schema.replace(/^[|]$/g, '').replace(/]]/g, ']')) // removes brackets at start end end, change ']]' to ']'
                .replace(/<escaped_table_name>/g, fullTableName) // use the escaped table name for the OBJECT_ID() function
                .replace(/<table_catalog>/g, cat) // use the escaped table name for the OBJECT_ID() function

              return sql
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

      /*
     based on an instance bind properties of that instance to a given table.
     Will have to allow for not all properties binding i.e. may be partial persistence - and allow for
     mappings i.e. object.myName = table.<name> or table.my_name etc.
     */

      function describe (name) {
        return new Promise((resolve, reject) => {
          let tableMeta = cache[name]
          if (!tableMeta) {
            describeTable(name).then(cols => {
              tableMeta = new Meta(name, cols)
              cache[name] = tableMeta
              resolve(tableMeta)
            }).catch(err => {
              reject(err)
            })
          } else {
            resolve(tableMeta)
          }
        })
      }

      // promise safe (err, table)
      function getTable (table, cb) {
        describe(table).then(meta => {
          const bulkMgr = new BulkTableOpMgr(theConnection, user, meta)
          bulkTableManagers[table] = bulkMgr
          cb(null, bulkMgr)
        }).catch(err => {
          cb(err, null)
        })
      }

      // (table)
      function bind (table, cb) {
        describe(table).then(meta => {
          const bulkMgr = new BulkTableOpMgr(theConnection, user, meta)
          bulkTableManagers[table] = bulkMgr
          cb(bulkMgr)
        }).catch(err => {
          cb(null, err)
        })
      }

      this.describe = describe
      this.bind = bind
      this.getTable = getTable
      this.promises = new TableMgrPromises(this)
    }
  }

  class Meta {
    constructor (tableName, cols) {
      this.tableName = tableName
      // filter out duplicate columns with the same name
      this.cols = cols.filter((item, pos) => cols.findIndex(col => col.name === item.name) === pos)
      this.fullTableName = cols.length > 0 && cols[0].table_catalog !== 'tempdb'
        ? this.getFullName()
        : tableName
      this.bcpTableName = this.fullTableName.replace(/\[/g, '').replace(/\]/g, '')
      this.allColumns = cols

      this.assignableColumns = this.recalculateAssignableColumns()
      this.primaryCols = this.recalculatePrimaryColumns()
      this.primaryByName = this.primaryCols.reduce((agg, col) => {
        agg[col.name] = col
        return agg
      }, {})

      this.colByName = this.allColumns.reduce((agg, col) => {
        agg[col.name] = col
        return agg
      }, {})

      this.setWhereCols(this.primaryCols)
      this.setUpdateCols(this.recalculateUpdateColumns())
    }

    getFullName () {
      const first = this.cols[0]
      return `[${first.table_catalog}].[${first.table_schema}].[${first.table_name}]`
    }

    readOnly (col) {
      return (col.is_identity || col.is_computed || col.is_hidden || col.generated_always_type)
    }

    recalculateAssignableColumns () {
      return this.allColumns.filter(col => !this.readOnly(col))
    }

    recalculatePrimaryColumns () {
      return this.allColumns.filter(col => col.is_primary_key)
    }

    columnSet (colSubSet, operator) {
      operator = operator || ' and '
      return `${colSubSet.map(e => `[${e.name}] = ?`).join(operator)}`
    }

    whereClause (colSubSet) {
      return `where ( ${this.columnSet(colSubSet)} )`
    }

    columnList (colSubSet) {
      return colSubSet.map(e => `[${e.name}]`).join(', ')
    }

    selectStatement (colSubSet) {
      return `select ${this.columnList(this.allColumns)} from ${this.fullTableName} ${this.whereClause(colSubSet)}`
    }

    deleteStatement (colSubSet) {
      return `delete from ${this.fullTableName} ${this.whereClause(colSubSet)}`
    }

    updateStatement (colSubSet) {
      return `update ${this.fullTableName} set ${this.columnSet(colSubSet, ', ')} ${this.whereClause(this.whereColumns)}`
    }

    insertStatement () {
      const subSet = this.recalculateAssignableColumns()
      const w = subSet.map(() => '?').join(', ')
      const values = subSet.length > 0 ? ` values ( ${w} )` : ''
      return `insert into ${this.fullTableName} ( ${this.columnList(subSet)} ) ${values}`
    }

    filteredSet (colSubSet) {
      return colSubSet.reduce((agg, c) => {
        if (Object.prototype.hasOwnProperty.call(this.colByName, c.name)) {
          agg.push(this.colByName[c.name])
        }
        return agg
      }, [])
    }

    setWhereCols (colSubSet) {
      const subSet = this.filteredSet(colSubSet)
      this.whereColumns = subSet
      this.insertSignature = this.insertStatement()
      this.deleteSignature = this.deleteStatement(subSet)
      this.selectSignature = this.selectStatement(subSet)
      this.updateSignature = this.updateStatement(subSet)

      return this.selectSignature
    }

    setUpdateCols (colSubSet) {
      const filtered = this.filteredSet(colSubSet)
      this.updateColumns = filtered
      this.updateSignature = this.updateStatement(filtered)

      return this.updateSignature
    }

    recalculateUpdateColumns () {
      const assignable = this.recalculateAssignableColumns()
      return assignable.filter(col => !Object.prototype.hasOwnProperty.call(this.primaryByName, col.name))
    }

    getSummary () {
      return {
        insertSignature: this.insertSignature,
        whereColumns: this.whereColumns,
        updateColumns: this.updateColumns,
        selectSignature: this.selectSignature,
        deleteSignature: this.deleteSignature,
        updateSignature: this.updateSignature,
        columns: this.allColumns,
        primaryColumns: this.primaryCols,
        assignableColumns: this.assignableColumns,
        by_name: this.colByName
      }
    }

    toString () {
      const s = this.getSummary()
      return JSON.stringify(s, null, 4)
    }

    // export api

    getAllColumns () {
      return this.allColumns
    }

    getInsertSignature () {
      return this.insertSignature
    }

    getWhereColumns () {
      return this.whereColumns
    }

    getUpdateColumns () {
      return this.updateColumns
    }

    getSelectSignature () {
      return this.selectSignature
    }

    getDeleteSignature () {
      return this.deleteSignature
    }

    getUpdateSignature () {
      return this.updateSignature
    }

    getPrimaryColumns () {
      return this.primaryCols
    }

    getAssignableColumns () {
      return this.assignableColumns
    }

    getColumnsByName () {
      return this.colByName
    }
  }

  class BulkPromises {
    constructor (bulk) {
      this.insert = util.promisify(bulk.insertRows)
      this.delete = util.promisify(bulk.deleteRows)
      this.select = util.promisify(bulk.selectRows)
      this.update = util.promisify(bulk.updateRows)
    }
  }

  class BulkTableOpMgr {
    constructor (theConnection, user, m) {
      const meta = m

      let batch = 0
      let meTableType = null
      let summary = meta.getSummary()
      let tvp = null
      let bcp = false
      let declaredTypeByColumn = {}
      // if utc is off, we switch to using meta data from table columns
      // and on date related columns, the local timezone offset is sent
      // to driver to offset the UTC timestamp - giving ability to write local
      // dates into the database.
      if (theConnection.getUseUTC() === false) {
        useMetaType(true)
      }

      function asTableType (name) {
        const summary = meta.getSummary()
        const columns = summary.columns

        if (!name) {
          name = `${columns[0].table_name}Type`
        }
        const cols = userTypeCols(name)
        return new user.Table(name, cols)
      }

      function colRequiresOffsetTz (col) {
        return col.type === 'datetimeoffset' ||
        col.type === 'datetime' ||
        col.type === 'datetime2' ||
        col.type === 'time' ||
        col.type === 'date' ||
        col.type === 'smalldatetime'
      }

      function userTypeCols () {
        const summary = meta.getSummary()
        const columns = summary.columns
        const cols = []
        const useUTC = theConnection.getUseUTC()
        columns.forEach(col => {
          let declaration = `${col.name} ${col.type}`
          let length = 0
          if (col.max_length > 0) {
            if (col.type === 'nvarchar') {
              length = col.max_length / 2
            } else if (col.type === 'varbinary') {
              length = col.max_length
            }
          }

          if (length > 0) {
            declaration += `(${length})`
          }
          let offset = 0
          const isDateTime = colRequiresOffsetTz(col)
          if (useUTC === false && isDateTime) {
            offset = new Date().getTimezoneOffset()
          }
          cols.push({
            name: col.name,
            userType: declaration,
            scale: col.scale,
            precision: col.precision,
            type: {
              offset: offset,
              declaration: col.type,
              length: length
            }
          })
        })
        return cols
      }

      function asUserType (name) {
        const summary = meta.getSummary()
        const columns = summary.columns
        const cols = userTypeCols()
        const declarations = cols.map(c => c.userType).join(', ')
        // CREATE TYPE TestType AS TABLE ( a VARCHAR(50), b INT );

        if (!name) {
          name = `${columns[0].table_name}Type`
        }
        return `CREATE TYPE ${name} AS TABLE (${declarations})`
      }

      // create an object of arrays where each array represents all values
      // for the batch.

      function prepare () {
        return summary.columns.reduce((agg, col) => {
          const property = col.name
          if (Object.prototype.hasOwnProperty.call(summary.by_name, property) &&
        !meta.readOnly(summary.by_name[property])) {
            agg.keys.push(property)
            if (!Object.prototype.hasOwnProperty.call(agg.arrays_by_name, property)) {
              agg.arrays_by_name[property] = []
            }
          }
          return agg
        }, {
          keys: [],
          arrays_by_name: {}
        })
      }

      function arrayPerColumn (vec) {
        const res = prepare()
        vec.forEach(instance => {
          res.keys.reduce((agg, property) => {
            const columnValues = agg[property]
            const val = Object.prototype.hasOwnProperty.call(instance, property)
              ? instance[property]
              : null
            columnValues.push(val)
            return agg
          }, res.arrays_by_name)
        })

        return res
      }

      // if batch size is set, split the input into that batch size.

      function rowBatches (rows) {
        const batches = []
        if (batch === 0) {
          batches.push(rows)
        } else {
          let singleBatch = []
          for (let i = 0; i < rows.length; i += 1) {
            singleBatch.push(rows[i])
            if (singleBatch.length === batch) {
              batches.push(singleBatch)
              singleBatch = []
            }
          }
        }

        return batches
      }

      // driver will have to recognise this is an array of arrays where each array
      // represents all values for that particular column.

      function arrayPerColumnForCols (rows, colSubSet, usebcp) {
        const colsByName = arrayPerColumn(rows).arrays_by_name
        const res = colSubSet.reduce((agg, col) => {
          if (Object.prototype.hasOwnProperty.call(colsByName, col.name)) {
            const valueVector = colsByName[col.name]
            if (Object.prototype.hasOwnProperty.call(declaredTypeByColumn, col.name)) {
              const declaration = declaredTypeByColumn[col.name]
              agg.push({
                value: valueVector,
                offset: declaration.offset || 0,
                sql_type: declaration.sql_type,
                precision: declaration.precision,
                scale: declaration.scale,
                bcp: usebcp,
                ordinal_position: col.ordinal_position,
                table_name: usebcp ? meta.bcpTableName : ''
              })
            } else {
              agg.push(valueVector)
            }
          }
          return agg
        }, [])
        return res
      }

      // given the input array of asObjects consisting of potentially all columns, strip out
      // the sub set corresponding to the where column set.

      function whereForRowsNoBatch (sql, rows, callback) {
        const colArray = arrayPerColumnForCols(rows, summary.whereColumns)
        theConnection.query(sql, colArray, callback)
      }

      function selectRows (rows, callback) {
        const res = []
        whereForRowsNoBatch(summary.selectSignature, rows, (err, results, more) => {
          results.forEach(r => {
            res.push(r)
          })
          if (!more) {
            callback(err, res)
          }
        })
      }

      function runQuery (sql, colArray) {
        return new Promise((resolve, reject) => {
          theConnection.query(sql, colArray, (e, res) => {
            if (e) {
              reject(e)
            } else {
              resolve(res)
            }
          })
        })
      }

      function batchIterator (sql, rows, iterate) {
        return Promise.all(rowBatches(rows).map(b => runQuery(sql, iterate(b))))
      }

      function insertRows (rows, callback) {
        batchIterator(summary.insertSignature, rows, b => arrayPerColumnForCols(b, summary.assignableColumns, bcp))
          .then(res => {
            callback(null, res)
          }).catch(e => callback(e, null))
      }

      function updateRows (rows, callback) {
        batchIterator(summary.updateSignature, rows, b => arrayPerColumnForCols(b, summary.updateColumns, false).concat(arrayPerColumnForCols(b, summary.whereColumns)))
          .then(res => {
            callback(null, res)
          }).catch(e => callback(e, null))
      }

      function deleteRows (rows, callback) {
        batchIterator(summary.deleteSignature, rows, b => arrayPerColumnForCols(b, summary.whereColumns, false))
          .then(res => {
            callback(null, res)
          }).catch(e => callback(e, null))
      }

      function getMeta () {
        return meta
      }

      function setBatchSize (batchSize) {
        batch = batchSize
      }

      function setWhereCols (whereCols) {
        meta.setWhereCols(whereCols)
        summary = meta.getSummary()
      }

      function setUpdateCols (updateCols) {
        meta.setUpdateCols(updateCols)
        summary = meta.getSummary()
      }

      function getSummary () {
        return meta.getSummary()
      }

      // insert only
      function setUseBcp (v) {
        bcp = v
        if (bcp) {
          this.useMetaType(true)
        }
      }

      function getUseBcp () {
        return bcp
      }

      function useMetaType (v) {
        if (v) {
          meTableType = asTableType('me')
          tvp = userTypes.TvpFromTable(meTableType)
          for (let i = 0; i < meta.cols.length; ++i) {
            const col = meta.cols[i]
            declaredTypeByColumn[col.name] = tvp.table_value_param[i]
          }
        } else {
          meTableType = null
          tvp = null
          declaredTypeByColumn = {}
        }
      }

      // public api

      this.useMetaType = useMetaType
      this.asTableType = asTableType
      this.asUserType = asUserType

      this.insertRows = insertRows
      this.selectRows = selectRows
      this.deleteRows = deleteRows
      this.updateRows = updateRows

      this.setBatchSize = setBatchSize
      this.setWhereCols = setWhereCols
      this.setUpdateCols = setUpdateCols
      this.getMeta = getMeta
      this.meta = meta
      this.columns = meta.getAllColumns()
      this.getSummary = getSummary
      this.setUseBcp = setUseBcp
      this.getUseBcp = getUseBcp
      this.promises = new BulkPromises(this)
    }
  }

  return {
    TableMgr: TableMgr
  }
})()

exports.tableModule = tableModule
