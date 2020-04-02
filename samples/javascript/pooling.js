const sql = require('msnodesqlv8')

const pool = new sql.Pool()
pool.on('open', () => {
  console.log('ready')
})

pool.on('debug', msg => {
  console.log(`\t\t\t\t\t\t${new Date().toLocaleTimeString()} <pool.debug> ${msg}`)
})

pool.on('error', e => {
  console.log(e)
})

const testSql = 'waitfor delay \'00:00:10\';'

function submit (sql) {
  const q = pool.query(sql)
  console.log(`send ${new Date().toLocaleTimeString()}, sql = ${sql}`)
  q.on('submitted', d => {
    console.log(`query submitted ${new Date().toLocaleTimeString()}, sql = ${d.query_str}`)
    q.on('done', () => console.log(`query done ${new Date().toLocaleTimeString()}`))
  })
  return q
}

for (let i = 0; i < 7; ++i) {
  const q = submit(testSql)
  if (i >= 5) q.cancelQuery()
}

setInterval(() => {
  submit(testSql)
}, 60000)

pool.open()
