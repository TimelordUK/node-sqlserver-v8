'use strict'

const { ServerDialect } = require('./dialect')
const { EOL } = require('os')
class TableBuilder {
  constructor (mgr, conn, tableName, tableCatelog, tableSchema) {
    this.mgr = mgr
    this.theConnection = conn
    this.dialect = ServerDialect.SqlServer
    this.tableName = tableName
    this.tableSchema = tableSchema || 'dbo'
    this.tableCatelog = tableCatelog
    this.columns = []
    this.insertColumns = []
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
    return c.typed(false, true)
  }

  dropProc (name) {
    return `IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND OBJECT_ID = OBJECT_ID('${name}')) begin drop PROCEDURE ${name} end`
  }

  compute () {
    const tableName = this.fullTableName
    const fullTypedColumns = this.columns.map(e => `[${e.name}] ${this.typed(e)}`).join(', ')

    const insertColumnNames = this.columns.filter(c => {
      return !c.isReadOnly()
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
    const createTableSql = `CREATE TABLE ${tableName} (${fullTypedColumns})`
    const insertColumns = this.columns.filter(c => !c.isReadOnly())
    const typedColumns = insertColumns.map(e => `[${e.name}] ${e.procTyped()}`).join(', ')
    const typeName = `${this.tableSchema}.${this.tableName}Type`
    const dropTypeSql = `IF TYPE_ID(N'${typeName}') IS not NULL drop type ${typeName}`
    const userTypeTableSql = `CREATE TYPE ${typeName} AS TABLE (${typedColumns})`
    const nameBar = tableName.replace(/\./g, '_')
    const clusteredSql = `CREATE CLUSTERED INDEX IX_${nameBar}_c ON ${tableName}(${primaryNames})`
    const nonClusteredSql = `CREATE NONCLUSTERED INDEX IX_${nameBar}_nc ON ${tableName}(${columnNames})`
    const insertSql = `INSERT INTO ${tableName} (${insertColumnNames}) VALUES `
    const selectSql = `SELECT ${columnNames} FROM ${tableName}`
    const trucateSql = `TRUNCATE TABLE ${tableName}`
    const paramsSql = `(${this.columns.map(_ => '?').join(', ')})`

    this.typeName = typeName
    this.dropTypeSql = dropTypeSql
    this.userTypeTableSql = userTypeTableSql
    this.insertColumns = insertColumns
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
    this.insertTvpProcedureName = `${this.tableSchema}.${this.tableName}_tvp_inserter`
    this.dropInsertTvpProcedure = this.dropProc(this.insertTvpProcedureName)
    this.insertProcedureTvpSql = this.insertTvpProcSql()
  }

  /*
  const insertProcedureSql = `create PROCEDURE ${insertProcedureTypeName}
@tvp ${tableTypeName} READONLY
AS
BEGIN
set nocount on
INSERT INTO ${tableName}
(
 [description],
 [username],
 [age],
 [salary],
 [code],
 [start_date]
)
SELECT
[description],
[username],
[age],
[salary],
[code],
[start_date]
n FROM @tvp tvp
END`
   */

  insertTvpProcSql (procname, tableTypeName) {
    tableTypeName = tableTypeName || this.typeName
    procname = procname || this.insertTvpProcedureName
    const tableName = this.fullTableName
    const cnl = `, ${EOL}\t\t`
    const insertColumns = this.columns.filter(c => !c.isReadOnly())
    const params = insertColumns.map(c => `[${c.name}]`).join(cnl)
    return `create or alter procedure ${procname}
    ( 
      @tvp ${tableTypeName} READONLY
    )
    AS
    BEGIN
      set nocount on
      INSERT INTO ${tableName}
      (
        ${params}
      )
      SELECT
        ${params}
      n FROM @tvp tvp
    END`
  }

  /*
   CREATE TABLE [dbo].[test_encrpted_table](
     [id] [int] IDENTITY(1,1) NOT NULL,
     [field] [real] ENCRYPTED WITH (COLUMN_ENCRYPTION_KEY = [CEK_Auto1], ENCRYPTION_TYPE = Deterministic, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256') NULL
   ) ON [PRIMARY]
  */

  /*
  create procedure proc_insert_test_encrpted_table
  (
    @field float (8)
  )
  as
  begin
    declare @ae_field float (8)  = @field
    insert into test_encrpted_table (field)
    output inserted.*
    values (@ae_field)
  end
*/

  insertProcSql (procname) {
    const tableName = this.fullTableName
    procname = procname || `${this.tableSchema}.${this.tableName}_inserter`

    const cnl = `, ${EOL}\t\t`
    const nl = `${EOL}\t\t`
    const insertColumns = this.columns.filter(c => !c.isReadOnly())
    const params = insertColumns.map(c => `@${c.name} ${c.procTyped()}`).join(cnl)
    const declare = insertColumns.map(c => `declare @ae_${c.name} ${c.procTyped()} = @${c.name}`).join(nl)
    const paramNames = insertColumns.map(c => `${c.name}`).join(', ')
    const declareNames = insertColumns.map(c => `@ae_${c.name}`).join(', ')
    const insert = `insert into ${tableName} (${paramNames})`
    const values = `values (${declareNames})`
    return `create procedure ${procname}
    ( 
      ${params}
    )
    as
    begin
      ${declare}
      ${insert}
      output inserted.*
      ${values}
    end
    `
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

exports.TableBuilder = TableBuilder
