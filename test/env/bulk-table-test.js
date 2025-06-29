class BulkTableTest {
  constructor (c, def) {
    function where (list, primitive) {
      return list.reduce((agg, latest) => {
        if (primitive(latest)) {
          agg.push(latest)
        }
        return agg
      }, [])
    }
    const tableName = def.tableName
    const columns = def.columns.map(e => `${e.name} ${e.type}`).join(', ')
    const insertColumnNames = where(def.columns, c => {
      return !c.type.includes('identity')
    }).map(e => `${e.name}`).join(', ')
    const columnNames = def.columns.map(e => `${e.name}`).join(', ')
    const dropTableSql = `IF OBJECT_ID('${tableName}', 'U') IS NOT NULL DROP TABLE ${tableName};`
    const createTableSql = `CREATE TABLE ${tableName} (${columns})`
    const clusteredSql = `CREATE CLUSTERED INDEX IX_${tableName} ON ${tableName}(id)`
    const insertSql = `INSERT INTO ${tableName} (${insertColumnNames}) VALUES `
    const selectSql = `SELECT ${columnNames} FROM ${tableName}`
    const trucateSql = `TRUNCATE TABLE ${tableName}`
    const paramsSql = `(${def.columns.map(_ => '?').join(', ')})`

    this.definition = def
    this.theConnection = c
    this.dropTableSql = dropTableSql
    this.createTableSql = createTableSql
    this.clusteredSql = clusteredSql
    this.selectSql = selectSql
    this.insertSql = insertSql
    this.truncateSql = trucateSql
    this.tableName = def.tableName
    this.paramsSql = paramsSql
    this.insertParamsSql = `${insertSql} ${paramsSql}`
  }

  async drop () {
    await this.theConnection.promises.query(this.dropTableSql)
  }

  async create () {
    const promises = this.theConnection.promises
    await promises.query(this.dropTableSql)
    await promises.query(this.createTableSql)
    return await promises.getTable(this.tableName)
  }
}

module.exports = {
  BulkTableTest
}
