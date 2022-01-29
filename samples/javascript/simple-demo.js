const sql = require('msnodesqlv8')
const { GetConnection } = require('./get-connection')

const connectionString = new GetConnection().connectionString

const query = 'SELECT * FROM syscomments'

sql.open(connectionString, function (err, con) {
  if (err) {
    console.log(`failed to open ${err.message}`)
  }
  let d = new Date()
  con.query(query, function (err, rows) {
    if (err) {
      console.log(err.message)
      return
    }
    const elapsed = new Date() - d
    console.log(`rows.length ${rows.length} elapsed ${elapsed}`)
    d = new Date()
    con.query(query, function (err, rows) {
      if (err) {
        console.log(err.message)
        return
      }
      const elapsed = new Date() - d
      console.log(`rows.length ${rows.length} elapsed ${elapsed}`)
    })
  })
})
