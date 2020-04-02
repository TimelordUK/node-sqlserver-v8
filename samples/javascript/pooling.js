const sql = require('msnodesqlv8')

const pool = new sql.Pool()
pool.on('open', () => {
  console.log('ready')
})

pool.on('debug', msg => {
  console.log(`\t\t\t\t\t\t<pool.debug> ${msg}`)
})

pool.on('error', e => {
  console.log(e)
})

const testSql = 'waitfor delay \'00:00:10\';'

function submit (sql) {
  const q = pool.query(sql)
  q.on('submitted', d => {
    console.log(`query submitted ${new Date().toLocaleTimeString()}, sql = ${d.query_str}`)
    q.on('done', () => console.log(`query done ${new Date().toLocaleTimeString()}`))
  })
}

for (let i = 0; i < 7; ++i) {
  submit(testSql)
}

setInterval(() => {
  submit(testSql)
}, 60000)

pool.open()
