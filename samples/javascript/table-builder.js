const sql = require('msnodesqlv8')
// const connectionString = 'Driver={ODBC Driver 17 for SQL Server}; Server=DESKTOP-VIUCH90;UID=linux; PWD=linux; Database=node'

const { TestEnv } = require('../../test/env/test-env')
const env = new TestEnv()
const connectionString = env.connectionString

builder().then(() => {
  console.log(stripEscape('[node].[dbo].[BusinessID]'))
  console.log(stripEscape('[col_a]'))
  console.log(stripEscape('col_a'))
  console.log('done')
})

function stripEscape (columnName) {
  const columnParts = columnName.split(/\.(?![^[]*])/g)
  const qualified = columnParts[columnParts.length - 1]
  const columnNameRegexp = /\[?(.*?)]?$/g
  const match = columnNameRegexp.exec(qualified)
  const trim = match.filter(r => r !== '')
  return trim[trim.length - 1]
}

function decomposeSchema (qualifiedName, cat) {
  const tableParts = qualifiedName.split(/\.(?![^[]*])/g) // Split table names like 'dbo.table1' to: ['dbo', 'table1'] and 'table1' to: ['table1']
  const table = tableParts[tableParts.length - 1] // get the table name
  let fullTableName = table
  const schema = tableParts.length >= 2 ? tableParts[tableParts.length - 2] || '' : '' // get the table schema, if missing set schema to ''
  if (tableParts.length > 2) {
    cat = tableParts[tableParts.length - 3]
  } else if (table[0] === '#') {
    cat = '[tempdb]'
    fullTableName = `${cat}.${schema}.${table}`
  }
  return {
    qualifiedName,
    fullTableName,
    cat,
    schema,
    table
  }
}

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

    const vec = Array(rows).fill(0).map((_, i) => makeOne(i))
    const t = builder.toTable()
    const dropTypeSql = builder.dropTypeSql
    const userTypeSql = builder.userTypeTableSql
    const typeName = `${tableName}Type`
    const selectSql = `DECLARE @test AS ${typeName};
      INSERT INTO @test SELECT * FROM ?;
      SELECT * FROM @test`

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
    // can now clear rows
    table.rows = []
    const res = await connection.promises.query(selectSql, [tp])
    console.log(JSON.stringify(res.meta[0], null, 4))
    console.log(JSON.stringify(res.first, null, 4))
    await builder.drop()
    await connection.promises.close()
  } catch (e) {
    console.log(e)
  }
}
