const sql = require('msnodesqlv8')
// const connectionString = 'Driver={ODBC Driver 17 for SQL Server}; Server=DESKTOP-VIUCH90;UID=linux; PWD=linux; Database=node'

const { TestEnv } = require('../../test/env/test-env')
const env = new TestEnv()
const connectionString = env.connectionString

builder().then(() => console.log('done'))

async function builder () {
  function makeOne (i) {
    return {
      id: i,
      MatterColumn: `MatterColumn_${i}`,
      SearchTerm: `SearchTerm_${i}`,
      Comparator: `Comparator_${i}`
    }
  }

  try {
    const rows = 5
    const connection = await sql.promises.open(connectionString)
    const tableName = 'tmpTableBuilder'
    const mgr = connection.tableMgr()
    const builder = mgr.makeBuilder(tableName)

    builder.addColumn('id').asInt().isPrimaryKey(1)
    builder.addColumn('MatterColumn').asVarChar(100).notNull()
    builder.addColumn('SearchTerm').asNVarCharMax().notNull()
    builder.addColumn('Comparator').asNVarChar(20).notNull()

    const vec = []
    for (let i = 0; i < rows; ++i) {
      vec.push(makeOne(i))
    }
    const t = builder.toTable()
    const dropTypeSql = builder.dropTypeSql
    const userTypeSql = builder.userTypeTableSql
    const selectSql = 'select * from ?;'

    const create = builder.createTableSql
    const drop = builder.dropTableSql
    console.log(drop)
    await builder.drop()
    console.log(create)
    await builder.create()
    console.log(dropTypeSql)
    await connection.promises.query(dropTypeSql)
    console.log(userTypeSql)
    await connection.promises.query(userTypeSql)
    const table = t.asTableType()
    console.log(JSON.stringify(table, null, 4))
    // convert a set of objects to rows
    table.addRowsFromObjects(vec)
    // use a type the native driver can understand, using column based bulk binding.
    const tp = sql.TvpFromTable(table)
    const res = await connection.promises.query(selectSql, [tp])
    console.log(JSON.stringify(res.first, null, 4))
    await builder.drop()
    await connection.promises.close()
  } catch (e) {
    console.log(e)
  }
}
