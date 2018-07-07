const sql = require('msnodesqlv8')

const connectionString = 'Driver={SQL Server Native Client 11.0}; Server=np:\\\\.\\pipe\\LOCALDB#E086FCD9\\tsql\\query; Database={master}; Trusted_Connection=Yes;'

sql.open(connectionString, function (err, con) {
  if (err) {
    console.log('failed to open ' + err.message)
  }
  const req = con.query('select a;select b;')
  req.on("error", (msg) => {
    console.log("error", msg)
  })
})
