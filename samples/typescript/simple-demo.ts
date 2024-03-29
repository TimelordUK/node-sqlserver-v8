import { SqlClient } from 'msnodesqlv8/types'

const sql: SqlClient = require('msnodesqlv8')

const connectionString = 'server=.;Database=Master;Trusted_Connection=Yes;Driver={SQL Server Native Client 11.0}'
const query = 'SELECT name FROM sys.databases'

sql.query(connectionString, query, (err, rows) => {
  if (err != null) {
    console.error(err)
  } else {
    console.log(rows)
  }
})
