const sql = require('msnodesqlv8')
const { GetConnection } = require('./get-connection')

const connectionString = new GetConnection().connectionString
const query = 'SELECT top 5 * FROM syscomments'

// "Driver={Adaptive Server Enterprise}; app=myAppName; server=localhost port=5000; db=pubs3; uid=sa; pwd=ooooo;"

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

async function proc () {
  const def = `create or replace proc tmp_name_concat 
  @last_name varchar(30) = "knowles", 
  @first_name varchar(18) = "beyonce" as 
  select @first_name + " " + @last_name `

  const connection = await sql.promises.open(connectionString)
  const pm = connection.procedureMgr()
  const spName = 'tmp_name_concat'
  const params = [
    pm.makeParam(spName, '@last_name', 'varchar', 30, false),
    pm.makeParam(spName, '@first_name', 'varchar', 18, false)
  ]

  const proc = pm.addProc(spName, params)
  proc.setDialect(pm.ServerDialect.Sybase)
  try {
    await connection.promises.query(def)

    await runProcWith(connection, spName, {})
    await runProcWith(connection, spName, {
      first_name: 'Baby'
    })
    await runProcWith(connection, spName, {
      first_name: 'Miley',
      last_name: 'Cyrus'
    })

    await connection.promises.close()
  } catch (err) {
    console.error(err)
  }
}

async function run () {
  await proc()
  await q1()
  await promised()
}

run().then(() => {
  console.log('done')
})
