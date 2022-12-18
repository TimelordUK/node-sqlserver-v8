const { ServerDialect } = require('./dialect')

class TableMeta {
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
    this.bcpTableName = this.fullTableName.replace(/\[/g, '').replace(/]/g, '')
    this.allColumns = cols

    this.assignableColumns = this.recalculateAssignableColumns()
    this.assignableColumnNames = this.assignableColumns.map(c => c.name)
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

  hasColumn (name) {
    return Object.prototype.hasOwnProperty.call(this.colByName, name)
  }

  extractKeys (elem) {
    return this.primaryCols.reduce(function (obj, column) {
      if (Object.prototype.hasOwnProperty.call(elem, column.name)) {
        obj[column.name] = elem[column.name]
      }
      return obj
    }, {})
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

  getWithSchecmaName () {
    const first = this.cols[0]
    const tableSchema = this.enclose(first.table_schema)
    const tableName = this.enclose(first.table_name)
    if (first.table_schema) {
      return `${tableSchema}.${tableName}`
    } else {
      return `${tableName}`
    }
  }

  getFullName () {
    const withCat = this.getWithSchecmaName()
    const first = this.cols[0]
    const tableCatelog = this.enclose(first.table_catalog)
    if (first.table_catalog && first.table_schema) {
      return `${tableCatelog}.${withCat}`
    } else if (first.table_schema) {
      return withCat
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

exports.TableMeta = TableMeta
