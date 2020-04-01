const sql = require('msnodesqlv8')

const pool = new sql.Pool()
pool.on('open', () => {
  console.log('ready')
})
pool.open()
