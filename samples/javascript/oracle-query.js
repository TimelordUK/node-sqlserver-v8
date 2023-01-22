const sql = require('msnodesqlv8')
const { TestEnv } = require('../../test/env/test-env')
const env = new TestEnv('oracle')
const query = 'select * FROM user_tables'
const connectionString = env.connectionString

// "DRIVER={Oracle in OraClient21home1};DBQ=NODEORA;UID=node;PWD=linux;"

class ConnectionTester {
  async getPool (size) {
    const pool = new sql.Pool({
      connectionString,
      ceiling: size,
      heartbeatSql: 'select 1 from dual'
    })
    pool.on('error', e => {
      throw e
    })
    const options = await pool.promises.open()
    console.log(`pool opened : ${JSON.stringify(options, null, 4)}`)
    return pool
  }

  async killPool (pool) {
    await pool.promises.close()
    console.log('pool closed')
  }

  async pool () {
    const pool = await this.getPool(4)
    const res = await pool.promises.query(query)
    console.log(JSON.stringify(res, null, 4))
    await this.killPool(pool)
  }

  async builder () {
    function makeOne (i) {
      return {
        id: i,
        col_a: i % 2 === 0 ? 'Y' : 'N',
        col_b: `str_${i}`,
        col_c: `str_${i}`,
        col_d: `str_${i}`,
        col_e: i + 1,
        col_f: i + 1,
        col_g: Math.pow(10, -(i % 5)),
        col_h: (i + 1) / (10 + (i * 5)),
        col_i: Math.pow(10, (i % 3)),
        col_j: new Date(),
        col_k: new Date(),
        col_l: Buffer.from('0123456789abcdef', 'hex')
      }
    }

    try {
      const rows = 5
      const connection = await sql.promises.open(connectionString)
      const tableName = 'tmpTableBuilder'
      const mgr = connection.tableMgr()
      const builder = mgr.makeBuilder(tableName, null, 'Node')
      builder.setDialect(mgr.ServerDialect.Oracle)

      builder.addColumn('id').asInt().isPrimaryKey(1)
      builder.addColumn('col_a').asChar(1)
      builder.addColumn('col_b').asVarChar(100)
      builder.addColumn('col_c').asNVarChar2(100)
      builder.addColumn('col_d').asNChar(10)
      builder.addColumn('col_e').asInt()
      builder.addColumn('col_f').asSmallInt()
      builder.addColumn('col_g').asNumeric(23, 18)
      builder.addColumn('col_h').asDecimal(23, 18)
      builder.addColumn('col_i').asReal()
      builder.addColumn('col_j').asDate()
      builder.addColumn('col_k').asTimestamp()
      builder.addColumn('col_l').asRaw(100)
      const vec = []
      for (let i = 0; i < rows; ++i) {
        vec.push(makeOne(i))
      }
      const t = builder.toTable()
      const create = builder.createTableSql
      const drop = builder.dropTableSql
      console.log(drop)
      await builder.drop()
      console.log(create)
      await builder.create()
      await t.promises.insert(vec)
      const keys = t.keys(vec)
      const res = await t.promises.select(keys)
      console.log(JSON.stringify(res, null, 4))
      // await builder.drop()
      await connection.promises.close()
    } catch (e) {
      console.log(e)
    }
  }

  legacyQuery () {
    return new Promise((resolve, reject) => {
      sql.open(connectionString, (err, con) => {
        if (err) {
          reject(err)
        }
        con.query(query, (err, rows) => {
          if (err) {
            reject(err)
          }
          con.close(() => {
            resolve(rows)
          })
        })
      })
    })
  }

  async promised () {
    const connection = await sql.promises.open(connectionString)
    const res = await connection.promises.query(query)
    console.log(`promised ${JSON.stringify(res, null, 4)}`)
    await connection.promises.close()
    return res
  }

  async q1 () {
    const d = new Date()
    try {
      const rows = await this.legacyQuery()
      const elapsed = new Date() - d
      console.log(`legacyQuery rows.length ${rows.length} elapsed ${elapsed}`)
      console.log(`legacyQuery ${JSON.stringify(rows, null, 4)}`)
    } catch (err) {
      console.error(err)
    }
  }

  async runProcWith (connection, spName, p) {
    console.log(`call proc ${spName} with params ${JSON.stringify(p, null, 4)}`)
    const res = await connection.promises.callProc(spName, p)
    const returns = res.first[0]['']
    console.log(`proc with params returns ${returns}`)
  }

  async makeProc (connection, spName) {
    try {
      const pm = connection.procedureMgr()
      const def = `create or replace proc tmp_name_concat 
  @last_name varchar(30) = "knowles", 
  @first_name varchar(18) = "beyonce" as 
  select @first_name + " " + @last_name `

      await connection.promises.query(def)

      const params = [
        pm.makeParam(spName, '@last_name', 'varchar', 30, false),
        pm.makeParam(spName, '@first_name', 'varchar', 18, false)
      ]

      const proc = pm.addProc(spName, params)
      proc.setDialect(pm.ServerDialect.Sybase)
      return proc
    } catch (err) {
      console.error(err)
    }
  }

  async proc () {
    const connection = await sql.promises.open(connectionString)
    const spName = 'tmp_name_concat'
    await this.makeProc(connection, spName)

    try {
      await this.runProcWith(connection, spName, {
        first_name: 'Baby'
      })
      await this.runProcWith(connection, spName, {})
      await this.runProcWith(connection, spName, {
        first_name: 'Miley',
        last_name: 'Cyrus'
      })

      await connection.promises.close()
    } catch (err) {
      console.error(err)
    }
  }

  async runOutputProcWith (connection, spName, p) {
    console.log(`call output proc ${spName} with params ${JSON.stringify(p, null, 4)}`)
    const res = await connection.promises.callProc(spName, p)
    console.log(`output proc with params returns ${JSON.stringify(res, null, 4)}`)
  }

  async makeOutputProc (connection, spName) {
    try {
      const pm = connection.procedureMgr()
      const def = `create or replace proc tmp_square 
    @num decimal, 
    @square decimal output as 
  select @square=@num* @num`

      await connection.promises.query(def)

      const params = [
        pm.makeParam(spName, '@num', 'decimal', 17, false),
        pm.makeParam(spName, '@square', 'decimal', 17, true)
      ]

      const proc = pm.addProc(spName, params)
      proc.setDialect(pm.ServerDialect.Sybase)
      return proc
    } catch (err) {
      console.error(err)
    }
  }

  async procOuput () {
    const connection = await sql.promises.open(connectionString)
    const spName = 'tmp_square'
    await this.makeOutputProc(connection, spName)

    try {
      await this.runOutputProcWith(connection, spName, {
        num: 15
      })

      await connection.promises.close()
    } catch (err) {
      console.error(err)
    }
  }

  async makeSelectProc (connection, spName) {
    try {
      const pm = connection.procedureMgr()
      const def = `create or replace proc tmp_input_output
    @len_last int output,
    @len_first int output,
    @first_last varchar(48) output, 
    @last_name varchar(30) = 'knowles', 
    @first_name varchar(18) = 'beyonce'
    as begin
      select @first_last = @first_name + " " + @last_name
      select @len_first = len(@first_name)
      select @len_last = len(@last_name)
      select len(@first_last)
    end`

      await connection.promises.query(def)

      const params = [
        pm.makeParam(spName, '@len_last', 'int', 4, true),
        pm.makeParam(spName, '@len_first', 'int', 4, true),
        pm.makeParam(spName, '@first_last', 'varchar', 48, true),
        pm.makeParam(spName, '@last_name', 'varchar', 30, false),
        pm.makeParam(spName, '@first_name', 'varchar', 18, false)
      ]

      const proc = pm.addProc(spName, params)
      proc.setDialect(pm.ServerDialect.Sybase)
      return proc
    } catch (err) {
      console.error(err)
    }
  }

  async procAsSelect () {
    const connection = await sql.promises.open(connectionString)
    const spName = 'tmp_input_output'

    try {
      const proc = await this.makeSelectProc(connection, spName)
      const meta = proc.getMeta()
      const select = meta.select
      console.log(select)
      const res = await connection.promises.query(select, ['Miley', 'Cyrus'])
      console.log(JSON.stringify(res, null, 4))
      await connection.promises.close()
    } catch (err) {
      console.error(err)
    }
  }
}

async function run () {
  const tester = new ConnectionTester()
  await env.open()
  await tester.pool()
  await tester.builder()
  // await procAsSelect()
  // await procOuput()
  // await proc()
  // await q1()
  // await promised()
  await env.close()
}

run().then(() => {
  console.log('done')
})
