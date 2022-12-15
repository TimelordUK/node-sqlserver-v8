import { SqlClient, TableBuilder, Connection, TableManager } from 'msnodesqlv8'

export const sql: SqlClient = require('msnodesqlv8')

const { TestEnv } = require('../../../test/env/test-env')
const env = new TestEnv()
const connectionString = env.connectionString

class Row {
  constructor (readonly id: number,
    readonly col_a: number,
    readonly col_b: string,
    readonly col_c: number,
    readonly col_d: number,
    readonly col_e: string) {
  }
}

async function builder (): Promise<void> {
  function makeOne (i: number): Row {
    return new Row(
      i, i * 5, `str_${i}`, i + 1, i - 1, `str2_${i}`)
  }

  try {
    const rows = 5
    const connection: Connection = await sql.promises.open(connectionString)
    const tableName = 'tmpTableBuilder'
    const mgr: TableManager = connection.tableMgr()
    const builder: TableBuilder = mgr.makeBuilder(tableName)
    builder.setDialect(mgr.ServerDialect.SqlServer)

    builder.addColumn('id').asInt().isPrimaryKey(1)
    builder.addColumn('col_a').asInt()
    builder.addColumn('col_b').asVarChar(100)
    builder.addColumn('col_c').asInt()
    builder.addColumn('col_d').asInt()
    builder.addColumn('col_e').asVarChar(100)

    const vec: Row[] = Array(rows).fill(0).map((_, i) => makeOne(i))
    const t = builder.toTable()
    const create: string = builder.createTableSql
    const drop: string = builder.dropTableSql
    console.log(drop)
    await builder.drop()
    console.log(create)
    await builder.create()
    await t.promises.insert(vec)
    const keys: object[] = t.keys(vec)
    const res: object[] = await t.promises.select(keys)
    console.log(JSON.stringify(res, null, 4))
    await builder.drop()
    await connection.promises.close()
  } catch (e) {
    console.log(e)
  }
}

async function run (): Promise<void> {
  await builder()
}

run().then(() => {
  console.log('done')
}).catch(e => {
  console.error(e)
})
