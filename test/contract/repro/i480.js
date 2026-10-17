'use strict'
const { sql, cs } = require('./common')
const QUERY = 'select top 51 object_id as a from sys.all_objects; select top 51 object_id as b from sys.all_objects'
function run (conn, pauseAtRow) {
  return new Promise((resolve, reject) => {
    const q = conn.query(QUERY)
    const meta = []
    const rowsPerResultSet = []
    let rows = 0
    q.on('meta', m => { meta.push(m.map(c => c.name).join()); rowsPerResultSet.push(0) })
    q.on('error', reject)
    q.on('row', () => {
      rowsPerResultSet[rowsPerResultSet.length - 1]++
      if (++rows === pauseAtRow) {
        q.pauseQuery()
        setTimeout(() => q.resumeQuery(), 50)
      }
    })
    q.on('free', () => resolve({ meta, rows, rowsPerResultSet }))
  })
}
sql.open(cs, async (err, conn) => {
  if (err) throw err
  for (const pauseAtRow of [50, 51, 52]) {
    console.log(`pause at row ${pauseAtRow}:`, JSON.stringify(await run(conn, pauseAtRow)))
  }
  conn.close(() => {})
})
