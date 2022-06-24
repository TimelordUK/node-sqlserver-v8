class TypeTableHelper {
  constructor (theConnection, sqlType) {
    const tableName = 'test_bulk_table'
    const dropTableSql = `IF OBJECT_ID('${tableName}', 'U') IS NOT NULL 
  DROP TABLE ${tableName};`

    const createTableSql = `CREATE TABLE ${tableName} (
      id INT PRIMARY KEY,
      col_a ${sqlType}
  );`

    function getVec (count, generator) {
      const v = []
      for (let i = 0; i < count; ++i) {
        const val = generator(i)
        v.push({
          id: i,
          col_a: val
        })
      }
      return v
    }

    async function create () {
      await theConnection.promises.query(dropTableSql)
      await theConnection.promises.query(createTableSql)
      return await theConnection.promises.getTable(tableName)
    }

    this.create = create
    this.getVec = getVec
  }
}

module.exports = {
  TypeTableHelper
}
