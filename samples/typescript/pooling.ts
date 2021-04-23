import {Error, PoolOptions, Query, SqlClient, QueryDescription, Pool, PoolStatusRecord} from 'msnodesqlv8';

// require the module so it can be used in your node JS code.
export const sql : SqlClient = require('msnodesqlv8');

function getConnection () {
  const path = require('path')
  const config = require(path.join(__dirname, '..\\javascript\\config.json'))
  return config.connection.local
}

const str = getConnection()
const pool: Pool = new sql.Pool({
  connectionString: str
})

pool.on('open', (options: PoolOptions) => {
  console.log(`ready options = ${JSON.stringify(options, null, 4)}`)
})

pool.on('debug', (msg: string) => {
  console.log(`\t\t\t\t\t\t${new Date().toLocaleTimeString()} <pool.debug> ${msg}`)
})

pool.on('status', (s: PoolStatusRecord) => {
  console.log(`status = ${JSON.stringify(s, null, 4)}`)
})

pool.on('error', (e: Error) => {
  console.log(e)
})

const testSql = 'waitfor delay \'00:00:10\';'

function submit (sql: string): Query {
  const q: Query = pool.query(sql)
  const timeStr = new Date().toLocaleTimeString()
  console.log(`send ${timeStr}, sql = ${sql}`)
  q.on('submitted', (d: QueryDescription) => {
    console.log(`query submitted ${timeStr}, sql = ${d.query_str}`)
    q.on('done', () => console.log(`query done ${timeStr}`))
  })
  return q
}

for (let i = 0; i < 7; ++i) {
  const q: Query = submit(testSql)
  switch (i) {
    case 5:
      console.log('cancel a query')
      q.cancelQuery()
      break
    case 6:
      q.pauseQuery()
      setTimeout(() => {
        console.log('resume a paused query')
        q.resumeQuery()
      }, 50000)
      break
    default:
      break
  }
}

setInterval(() => {
  submit(testSql)
}, 60000)

pool.open((e, options) => {
    if (e) {
        console.log(`Error ${e.message}`)
    } else {
        console.log(JSON.stringify(options,null, 4))
    }
})
