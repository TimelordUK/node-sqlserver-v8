const sql = require('msnodesqlv8')

const pool = new sql.Pool()
pool.on('open', () => {
  console.log('ready')
})

pool.on('debug', msg => {
  console.log(`\t\t\t\t\t\t<debug> ${msg}`)
})

for (let i = 0; i < 7; ++i) {
  const sql = 'waitfor delay \'00:00:10\';'
  const q = pool.query(sql)
  q.on('submitted', d => {
    console.log(`query submitted ${new Date()}`)
    q.on('done', () => console.log(`query done ${new Date()}`))
  })
}

pool.open()
