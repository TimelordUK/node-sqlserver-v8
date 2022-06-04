class TableHelper {
  constructor (theConnection) {
    const tableName = 'test_bulk_table'
    const dropTableSql = `IF OBJECT_ID('${tableName}', 'U') IS NOT NULL 
  DROP TABLE ${tableName};`

    const createTableSql = `CREATE TABLE ${tableName} (
      id INT PRIMARY KEY,
      col_a int,
      col_b int, 
      col_c int,
      col_d int,
      col_e int,
      col_f int,
  );`

    function getVec (count) {
      const v = []
      for (let i = 0; i < count; ++i) {
        v.push({
          id: i,
          col_a: (i + 1) * 10 + i,
          col_b: (i + 1) * 100 + i,
          col_c: (i + 1) * 1000 + i,
          col_d: (i + 1) * 10000 + i,
          col_e: (i + 1) * 100000 + i,
          col_f: (i + 1) * 1000000 + i
        })
      }
      return v
    }

    async function create () {
      const promises = theConnection.promises
      await promises.query(dropTableSql)
      await promises.query(createTableSql)
      const table = await theConnection.promises.getTable(tableName)
      return table
    }

    this.create = create
    this.getVec = getVec
  }
}

module.exports = {
  TableHelper
}
