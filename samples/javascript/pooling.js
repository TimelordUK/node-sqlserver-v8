const sql = require('msnodesqlv8')

const pool = new sql.Pool({
  connectionString: 'Driver={SQL Server Native Client 17.0}; Server=192.168.56.1; UID=linux; PWD=linux'
  // connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=(localdb)\\node;Database=scratch;Trusted_Connection=yes;'
})

pool.on('open', (options) => {
  console.log(`ready options = ${JSON.stringify(options, null, 4)}`)
})

pool.on('debug', msg => {
  console.log(`\t\t\t\t\t\t${new Date().toLocaleTimeString()} <pool.debug> ${msg}`)
})

pool.on('status', s => {
  console.log(`status = ${JSON.stringify(s, null, 4)}`)
})

pool.on('error', e => {
  console.log(e)
})

const testSql = 'waitfor delay \'00:00:10\';'

function submit (sql) {
  const q = pool.query(sql)
  const timeStr = new Date().toLocaleTimeString()
  console.log(`send ${timeStr}, sql = ${sql}`)
  q.on('submitted', d => {
    console.log(`query submitted ${timeStr}, sql = ${d.query_str}`)
    q.on('done', () => console.log(`query done ${timeStr}`))
  })
  return q
}

for (let i = 0; i < 7; ++i) {
  const q = submit(testSql)
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

pool.open()
