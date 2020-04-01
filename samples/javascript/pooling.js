const sql = require('msnodesqlv8')

const pool = new sql.Pool()
pool.on('open', () => {
  console.log('ready')
  for (let i = 0; i < 7; ++i) {
    const sql = 'waitfor delay \'00:00:10\';'
    pool.query(sql)
  }
})

pool.on('debug', msg => {
  console.log(msg)
})

pool.on('submitted', q => {
  console.log(`query submitted ${new Date()}`)
  q.on('done', () => console.log(`query done ${new Date()}`))
})
pool.open()
