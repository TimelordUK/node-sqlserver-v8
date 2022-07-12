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

  class TableColumn {
    constructor (tableName, tableSchema, ordinalPosition, columnName, type, maxLength, isPrimaryKey) {
      if (!columnName) return
      columnName = splitter.stripEscape(columnName)
      this.table_name = tableName
      this.table_schema = tableSchema
      this.name = columnName
      this.type = type
      this.max_length = maxLength
      this.is_primary_key = isPrimaryKey
      this.ordinal_position = ordinalPosition

      this.table_catalog = ''
      this.column_default = ''
      this.precision = 0
      this.scale = 0
      this.is_nullable = false
      this.is_computed = false
      this.is_identity = false
      this.object_id = 0
      this.generated_always_type = 0
      this.generated_always_type_desc = 'NOT_APPLICABLE'
      this.is_hidden = 0
      this.is_foreign_key = 0
      this.decorator = ''
    }

    static asTableColumn (rawCol) {
      const tp = new TableColumn()
      tp.fromRaw(rawCol)
      return tp
    }

    isReadOnly () {
      return (this.is_identity ||
        this.is_computed ||
        this.is_hidden ||
        this.generated_always_type ||
        this.type === 'timestamp')
    }

    isTzAdjusted () {
      return this.type === 'datetimeoffset' ||
        this.type === 'datetime' ||
        this.type === 'datetime2' ||
        this.type === 'time' ||
        this.type === 'date' ||
        this.type === 'smalldatetime'
    }

    asUserType (useUTC) {
      const declaration = `${this.typed(true)}`
      let length = 0
      if (this.max_length > 0) {
        if (this.type === 'nvarchar') {
          length = this.max_length / 2
        } else if (this.type === 'varbinary') {
          length = this.max_length
        } else {
          length = this.max_length
        }
      }

      let offset = 0
      const isDateTime = this.isTzAdjusted()
      if (useUTC === false && isDateTime) {
        offset = new Date().getTimezoneOffset()
      }
      return {
        name: this.name,
        userType: declaration,
        scale: this.scale,
        precision: this.precision,
        type: {
          offset,
          declaration: this.type,
          length
        }
      }
    }

    typed (user) {
      const oneParam =
        this.type === 'varbinary' ||
        this.type === 'varchar' ||
        this.type === 'nvarchar' ||
        this.type === 'nchar'

      const twoParam =
        this.type === 'numeric' ||
        this.type === 'decimal' ||
        this.type === 'time'

      const timeParam =
        this.type === 'time'

      let maxLength = this.max_length || 0
      if (this.type === 'nvarchar' || this.type === 'nchar') {
        if (maxLength === -1) {
          maxLength = 'MAX'
        } else {
          maxLength = maxLength / 2
        }
      }

      if (this.is_computed) {
        return user ? `${this.type}` : `${this.decorator}`
      } else if (timeParam) {
        return `${this.type} (${this.scale}) ${this.decorator}`
      } else if (oneParam) {
        return `${this.type} (${maxLength}) ${this.decorator}`
      } else if (twoParam) {
        return `${this.type} (${this.precision},${this.scale}) ${this.decorator}`
      } else {
        return `${this.type} ${this.decorator}`
      }
    }

    fromRaw (c) {
      this.table_name = c.table_name
      this.table_schema = c.table_schema
      this.name = c.name
      this.type = c.type
      this.max_length = c.max_length
      this.is_primary_key = c.is_primary_key

      this.ordinal_position = c.ordinal_position
      this.table_catalog = c.table_catalog
      this.column_default = c.column_default
      this.precision = c.precision
      this.scale = c.scale
      this.is_nullable = c.is_nullable
      this.is_computed = c.is_computed
      this.is_identity = c.is_identity
      this.object_id = c.object_id
      this.generated_always_type = c.generated_always_type
      this.generated_always_type_desc = c.generated_always_type_desc
      this.is_hidden = c.is_hidden
      this.is_foreign_key = c.is_foreign_key
      this.decorator = ''
    }

    asExpression (expression) {
      this.is_computed = true
      this.decorator = expression
      return this
    }

    isComputed (v) {
      this.is_computed = v
      return this
    }

    isIdentity (v, start, inc) {
      start = start || 1
      this.is_identity = v
      if (v) {
        inc = inc || 1
        this.decorator = `IDENTITY(${start},${inc})`
      }
      return this
    }

    isHidden (v) {
      this.is_hidden = v
      return this
    }

    isPrimaryKey (v) {
      this.is_primary_key = v
      return this
    }

    isForeignKey (v) {
      this.is_foreign_key = v
      return this
    }

    notNull () {
      this.decorator = 'NOT NULL'
      return this
    }

    null () {
      this.decorator = 'NULL'
      return this
    }

    withDecorator (v) {
      this.decorator = v
      return this
    }

    asBit () {
      this.type = 'bit'
      this.sql_type = userTypes.getSqlTypeFromDeclaredType(this).sql_type
      this.max_length = 1
      this.precision = 1
      this.scale = 0
      return this
    }

    asInt () {
      this.type = 'int'
      this.sql_type = userTypes.getSqlTypeFromDeclaredType(this).sql_type
      this.length = 4
      this.precision = 10
      this.scale = 0
      return this
    }

    asNVarCharMax () {
      return this.asNVarChar(-1)
    }

    asNVarChar (length) {
      this.type = 'nvarchar'
      this.sql_type = userTypes.getSqlTypeFromDeclaredType(this).sql_type
      this.max_length = length > 0 ? length * 2 : length
      this.precision = 0
      this.scale = 0
      return this
    }

    asVarBinary (length) {
      this.type = 'varbinary'
      this.sql_type = userTypes.getSqlTypeFromDeclaredType(this).sql_type
      this.max_length = length
      this.precision = 0
      this.scale = 0
      return this
    }

    asVarChar (length) {
      this.type = 'varchar'
      this.sql_type = userTypes.getSqlTypeFromDeclaredType(this).sql_type
      this.max_length = length
      this.precision = 0
      this.scale = 0
      return this
    }

    asDate () {
      this.type = 'date'
      this.sql_type = userTypes.getSqlTypeFromDeclaredType(this).sql_type
      this.max_length = 3
      this.precision = 10
      this.scale = 0
      return this
    }

    asTime () {
      this.type = 'time'
      this.sql_type = userTypes.getSqlTypeFromDeclaredType(this).sql_type
      this.max_length = 5
      this.precision = 16
      this.scale = 7
      return this
    }

    asDateTime () {
      this.type = 'datetime'
      this.sql_type = userTypes.getSqlTypeFromDeclaredType(this).sql_type
      this.max_length = 8
      this.precision = 23
      this.scale = 3
      return this
    }

    asDateTimeOffset () {
      this.type = 'datetimeoffset'
      this.sql_type = userTypes.getSqlTypeFromDeclaredType(this).sql_type
      this.max_length = 10
      this.precision = 34
      this.scale = 7
      return this
    }

    asSmallMoney () {
      return this.asNumeric(10, 4)
    }

    asNumeric (precision, scale) {
      this.type = 'numeric'
      this.sql_type = userTypes.getSqlTypeFromDeclaredType(this).sql_type
      this.max_length = 9
      this.precision = precision
      this.scale = scale
      return this
    }

    asDecimal (precision, scale) {
      this.type = 'decimal'
      this.sql_type = userTypes.getSqlTypeFromDeclaredType(this).sql_type
      this.max_length = 9
      this.precision = precision
      this.scale = scale
      return this
    }

    asUniqueIdentifier () {
      this.type = 'uniqueidentifier'
      this.sql_type = userTypes.getSqlTypeFromDeclaredType(this).sql_type
      this.max_length = 16
      this.precision = 0
      this.scale = 0
      return this
    }

    asHierarchyId () {
      this.type = 'hierarchyid'
      this.sql_type = userTypes.getSqlTypeFromDeclaredType(this).sql_type
      this.max_length = 892
      this.precision = 0
      this.scale = 0
      return this
    }

    asBigInt () {
      this.type = 'bigint'
      this.sql_type = userTypes.getSqlTypeFromDeclaredType(this).sql_type
      this.max_length = 8
      this.precision = 19
      this.scale = 0
      return this
    }

    asSmallInt () {
      this.type = 'smallint'
      this.sql_type = userTypes.getSqlTypeFromDeclaredType(this).sql_type
      this.max_length = 2
      this.precision = 5
      this.scale = 0
      return this
    }

    asTinyInt () {
      this.type = 'tinyint'
      this.sql_type = userTypes.getSqlTypeFromDeclaredType(this).sql_type
      this.max_length = 1
      this.precision = 3
      this.scale = 0
      return this
    }

    asReal () {
      this.type = 'real'
      this.sql_type = userTypes.getSqlTypeFromDeclaredType(this).sql_type
      this.max_length = 4
      this.precision = 24
      this.scale = 0
      return this
    }

    asNChar (length) {
      this.type = 'nchar'
      this.sql_type = userTypes.getSqlTypeFromDeclaredType(this).sql_type
      this.max_length = length > 0 ? length * 2 : length
      this.precision = 0
      this.scale = 0
      return this
    }
  }

  class TableBuilder {
    constructor (mgr, conn, tableName, tableCatelog, tableSchema) {
      this.mgr = mgr
      this.theConnection = conn
      this.dialect = ServerDialect.SqlServer
      this.tableName = tableName
      this.tableSchema = tableSchema || 'dbo'
      this.tableCatelog = tableCatelog
      this.columns = []
      this.fullTableName = this.getFullName()
      this.clear()
    }

    setDialect (d) {
      this.dialect = d
      this.fullTableName = this.getFullName()
    }

    enclose (txt, enclosed) {
      if (!txt) return null
      const begin = enclosed ? '[' : ''
      const end = enclosed ? ']' : ''
      return `${begin}${txt}${end}`
    }

    getFullName (enclosed) {
      const tableCatelog = this.enclose(this.tableCatelog, enclosed)
      const tableSchema = this.enclose(this.tableSchema, enclosed)
      const tableName = this.enclose(this.tableName, enclosed)
      if (tableCatelog && tableSchema) {
        return `${tableCatelog}.${tableSchema}.${tableName}`
      } else if (tableSchema) {
        return `${tableSchema}.${tableName}`
      } else {
        return `${tableName}`
      }
    }

    addColumn (columnName, columnType, maxLength, isPrimaryKey) {
      const col = this.mgr.makeColumn(
        this.tableName,
        this.tableSchema,
        this.columns.length + 1,
        columnName,
        columnType,
        maxLength,
        isPrimaryKey)
      col.table_catalog = this.tableCatelog
      this.columns.push(col)
      return col
    }

    typed (c) {
      return c.typed()
    }

    compute () {
      const tableName = this.fullTableName
      const columns = this.columns.map(e => `[${e.name}] ${this.typed(e)}`).join(', ')
      const insertColumnNames = this.columns.filter(c => {
        return !c.is_identity
      }).map(e => `${e.name}`).join(', ')

      const primaryColumns = this.columns.filter(c => c.is_primary_key)
      const primaryNames = primaryColumns.map(e => `${e.name}`).join(', ')
      const columnNames = this.columns.map(e => `[${e.name}]`).join(', ')
      let dropTableSql
      if (this.dialect === ServerDialect.Sybase) {
        dropTableSql = `IF OBJECT_ID('${this.getFullName(false)}') IS NOT NULL DROP TABLE ${tableName};`
      } else {
        dropTableSql = `IF OBJECT_ID('${tableName}', 'U') IS NOT NULL DROP TABLE ${tableName};`
      }
      const createTableSql = `CREATE TABLE ${tableName} (${columns})`
      const typeName = `${tableName}Type`
      const dropTypeSql = `IF TYPE_ID(N'${typeName}') IS not NULL drop type ${typeName}`
      const userTypeTableSql = `CREATE TYPE ${typeName} AS TABLE (${columns})`
      const nameBar = tableName.replace(/\./g, '_')
      const clusteredSql = `CREATE CLUSTERED INDEX IX_${nameBar}_c ON ${tableName}(${primaryNames})`
      const nonClusteredSql = `CREATE NONCLUSTERED INDEX IX_${nameBar}_nc ON ${tableName}(${columnNames})`
      const insertSql = `INSERT INTO ${tableName} (${insertColumnNames}) VALUES `
      const selectSql = `SELECT ${columnNames} FROM ${tableName}`
      const trucateSql = `TRUNCATE TABLE ${tableName}`
      const paramsSql = `(${this.columns.map(_ => '?').join(', ')})`

      this.dropTypeSql = dropTypeSql
      this.userTypeTableSql = userTypeTableSql
      this.primaryColumns = primaryColumns
      this.dropTableSql = dropTableSql
      this.createTableSql = createTableSql
      this.clusteredSql = clusteredSql
      this.nonClusteredSql = nonClusteredSql
      this.selectSql = selectSql
      this.insertSql = insertSql
      this.truncateSql = trucateSql
      this.paramsSql = paramsSql
      this.insertParamsSql = `${insertSql} ${paramsSql}`
    }

    toTable () {
      this.compute()
      const table = this.mgr.addTable(this.tableName, this.columns, this.dialect)
      table.useMetaType(true)
      return table
    }

    async drop () {
      if (this.dropTableSql.length > 0) {
        return await this.theConnection.promises.query(this.dropTableSql)
      }
    }

    async create () {
      if (this.createTableSql.length > 0) {
        return await this.theConnection.promises.query(this.createTableSql)
      }
    }

    async index () {
      if (this.clusteredSql.length > 0) {
        await this.theConnection.promises.query(this.clusteredSql)
      }
      if (this.nonClusteredSql.length > 0) {
        await this.theConnection.promises.query(this.nonClusteredSql)
      }
    }

    async truncate () {
      if (this.truncateSql.length > 0) {
        return await this.theConnection.promises.query(this.truncateSql)
      }
    }

    keys (vec) {
      return vec.map(elem => {
        return this.primaryColumns.reduce(function (obj, column) {
          if (Object.prototype.hasOwnProperty.call(elem, column.name)) {
            obj[column.name] = elem[column.name]
          }
          return obj
        }, {})
      })
    }

    clear () {
      while (this.columns.length > 0) {
        this.columns.pop()
      }
      this.dropTableSql = ''
      this.createTableSql = ''
      this.clusteredSql = ''
      this.selectSql = ''
      this.insertSql = ''
      this.truncateSql = ''
      this.paramsSql = ''
      this.insertParamsSql = ''
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

      /*
        ordinal_position: 2,
        table_catalog: "",
        table_schema: "dbo",
        table_name: "test_default_val_table_bulk",
        column_default: "('def1')",
        name: "s1",
        type: "varchar",
        max_length: 255,
        precision: 0,
        scale: 0,
        is_nullable: false,
        is_computed: false,
        is_identity: false,
        object_id: 2137696055,
        generated_always_type: 0,
        generated_always_type_desc: "NOT_APPLICABLE",
        is_hidden: 0,
        is_primary_key: 0,
        is_foreign_key: 0,
      */

      function makeColumn (tableName, tableSchema, position, columnName, columnType, maxLength, isPrimaryKey) {
        return new TableColumn(tableName, tableSchema, position, columnName, columnType, maxLength, isPrimaryKey)
      }

      function addMeta (tableName, columns, dialect) {
        const tableMeta = new Meta(tableName, columns, dialect)
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
          bulkMgr = new BulkTableOpMgr(theConnection, user, meta)
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

  class Meta {
    constructor (tableName, cols, dialect) {
      this.dialect = dialect || ServerDialect.SqlServer
      this.tableName = tableName
      this.build(tableName, cols)
    }

    build (tableName, cols) {
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

    setDialect (d) {
      this.dialect = d
      this.build(this.tableName, this.cols)
    }

    enclose (txt) {
      const begin = '['
      const end = ']'
      return `${begin}${txt}${end}`
    }

    getFullName () {
      const first = this.cols[0]
      const tableCatelog = this.enclose(first.table_catalog)
      const tableSchema = this.enclose(first.table_schema)
      const tableName = this.enclose(first.table_name)
      if (first.table_catalog && first.table_schema) {
        return `${tableCatelog}.${tableSchema}.${tableName}`
      } else if (first.table_schema) {
        return `${tableSchema}.${tableName}`
      } else {
        return `${tableName}`
      }
    }

    recalculateAssignableColumns () {
      return this.allColumns.filter(col => !col.isReadOnly())
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
      let bcpVersion = 17
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

      function keys (vec) {
        return vec.map(elem => {
          return meta.primaryCols.reduce(function (obj, column) {
            if (Object.prototype.hasOwnProperty.call(elem, column.name)) {
              obj[column.name] = elem[column.name]
            }
            return obj
          }, {})
        })
      }

      function userTypeCols () {
        const summary = meta.getSummary()
        const useUTC = theConnection.getUseUTC()
        return summary.columns.map(c => c.asUserType(useUTC))
      }

      function asUserType (name) {
        const summary = meta.getSummary()
        const columns = summary.columns
        const cols = userTypeCols()
        const declarations = cols.map(c => `${c.name} ${c.userType}`).join(', ')
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
        !summary.by_name[property].isReadOnly()) {
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
        return colSubSet.reduce((agg, col) => {
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
                bcp_version: bcpVersion,
                ordinal_position: col.ordinal_position,
                table_name: usebcp ? meta.bcpTableName : ''
              })
            } else {
              agg.push(valueVector)
            }
          }
          return agg
        }, [])
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

      function setBcpVersion (v) {
        bcpVersion = v
      }

      function getBcpVersion () {
        return bcpVersion
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
      this.setBcpVersion = setBcpVersion
      this.getBcpVersion = getBcpVersion
      this.keys = keys
      this.promises = new BulkPromises(this)
    }
  }

  return {
    TableMgr
  }
})()

exports.tableModule = tableModule
