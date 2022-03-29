import { SqlClient, TableBuilder, Connection, TableManager } from 'msnodesqlv8';

// require the module so it can be used in your node JS code.
export const sql: SqlClient = require('msnodesqlv8');
const path = require('path')
const { GetConnection } = require(path.join(__dirname, '..\\javascript\\', '../javascript/get-connection'))

const connectionString: string = new GetConnection().connectionString

async function builder () {
    function makeOne (i: number): any {
      return {
        id: i,
        col_a: i * 5,
        col_b: `str_${i}`,
        col_c: i + 1,
        col_d: i - 1,
        col_e: `str2_${i}`
      }
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
      const vec = Array(rows).fill(0).map((_, i) => makeOne(i))
      const t = builder.toTable()
      const create: string = builder.createTableSql
      const drop: string = builder.dropTableSql
      console.log(drop)
      await builder.drop()
      console.log(create)
      await builder.create()
      await t.promises.insert(vec)
      const keys: any[] = t.keys(vec)
      const res: any[] = await t.promises.select(keys)
      console.log(JSON.stringify(res, null, 4))
      await builder.drop()
      await connection.promises.close()
    } catch (e) {
      console.log(e)
    }
  }

  async function run () {
    await builder()
  }
  
  run().then(() => {
    console.log('done')
  })
  
