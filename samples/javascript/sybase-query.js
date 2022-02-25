const sql = require('msnodesqlv8')
const { GetConnection } = require('./get-connection')

const connectionString = new GetConnection().connectionString

const query = 'SELECT top 5 * FROM syscomments'

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

async function run () {
  await q1()
  await promised()
}

run().then(() => {
  console.log('done')
})
