const sql = require('msnodesqlv8')
const { GetConnection } = require('./get-connection')

const connectionString = new GetConnection('ase').connectionString
const query = 'SELECT top 5 * FROM syscomments'

// "Driver={Adaptive Server Enterprise}; app=myAppName; server=localhost port=5000; db=pubs3; uid=sa; pwd=ooooo;"

async function getPool (size) {
  const pool = new sql.Pool({
    connectionString: connectionString,
    ceiling: size
  })
  pool.on('error', e => {
    throw e
  })
  const options = await pool.promises.open()
  console.log(`pool opened : ${JSON.stringify(options, null, 4)}`)
  return pool
}

async function killPool (pool) {
  await pool.promises.close()
  console.log('pool closed')
}

async function pool () {
  const pool = await getPool(5)
  const res = await pool.promises.query(query)
  console.log(JSON.stringify(res, null, 4))
  await killPool(pool)
}

async function builder () {
  function makeOne (i) {
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
    const connection = await sql.promises.open(connectionString)
    const tableName = 'tmpTableBuilder'
    const mgr = connection.tableMgr()
    const builder = mgr.makeBuilder(tableName)
    builder.setDialect(mgr.ServerDialect.Sybase)
    builder.addColumn('id').asInt().isPrimaryKey(1)
    builder.addColumn('col_a').asInt()
    builder.addColumn('col_b').asVarChar(100)
    builder.addColumn('col_c').asInt()
    builder.addColumn('col_d').asInt()
    builder.addColumn('col_e').asVarChar(100)
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
    await builder.drop()
    await connection.promises.close()
  } catch (e) {
    console.log(e)
  }
}

function legacyQuery () {
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

async function promised () {
  const connection = await sql.promises.open(connectionString)
  const res = await connection.promises.query(query)
  console.log(`promised ${JSON.stringify(res, null, 4)}`)
  await connection.promises.close()
  return res
}

async function q1 () {
  const d = new Date()
  try {
    const rows = await legacyQuery()
    const elapsed = new Date() - d
    console.log(`legacyQuery rows.length ${rows.length} elapsed ${elapsed}`)
    console.log(`legacyQuery ${JSON.stringify(rows, null, 4)}`)
  } catch (err) {
    console.error(err)
  }
}

async function runProcWith (connection, spName, p) {
  console.log(`call proc ${spName} with params ${JSON.stringify(p, null, 4)}`)
  const res = await connection.promises.callProc(spName, p)
  const returns = res.first[0]['']
  console.log(`proc with params returns ${returns}`)
}

async function makeProc (connection, spName) {
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

async function proc () {
  const connection = await sql.promises.open(connectionString)
  const spName = 'tmp_name_concat'
  await makeProc(connection, spName)

  try {
    await runProcWith(connection, spName, {
      first_name: 'Baby'
    })
    await runProcWith(connection, spName, {})
    await runProcWith(connection, spName, {
      first_name: 'Miley',
      last_name: 'Cyrus'
    })

    await connection.promises.close()
  } catch (err) {
    console.error(err)
  }
}

async function runOutputProcWith (connection, spName, p) {
  console.log(`call output proc ${spName} with params ${JSON.stringify(p, null, 4)}`)
  const res = await connection.promises.callProc(spName, p)
  console.log(`output proc with params returns ${JSON.stringify(res, null, 4)}`)
}

async function makeOutputProc (connection, spName) {
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

async function procOuput () {
  const connection = await sql.promises.open(connectionString)
  const spName = 'tmp_square'
  await makeOutputProc(connection, spName)

  try {
    await runOutputProcWith(connection, spName, {
      num: 15
    })

    await connection.promises.close()
  } catch (err) {
    console.error(err)
  }
}

async function makeSelectProc (connection, spName) {
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

async function procAsSelect () {
  const connection = await sql.promises.open(connectionString)
  const spName = 'tmp_input_output'

  try {
    const proc = await makeSelectProc(connection, spName)
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

async function run () {
  await pool()
  await builder()
  await procAsSelect()
  await procOuput()
  await proc()
  await q1()
  await promised()
}

run().then(() => {
  console.log('done')
})
