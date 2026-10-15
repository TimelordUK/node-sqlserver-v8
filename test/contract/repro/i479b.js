'use strict'
// comment on #479: point 4 (paused polling query cancelled) and point 5 (pause + cancel before first state change)
const { sql, cs } = require('./common')
const big = 'select top 5000 a.name from sys.all_objects a cross join sys.all_objects b'
const which = process.argv[2]
const t0 = Date.now()
const log = m => console.log(`+${String(Date.now() - t0).padStart(5)}ms ${m}`)
function trace (q) {
  q.on('error', (e, more) => log(`error ${e.sqlstate} ${e.message} more=${more}`))
  q.on('done', () => log('done'))
  q.on('free', () => log('free'))
}
const followUp = conn => conn.query('select 1 as n', (err, res) => {
  log(`follow-up ${err ? err.message : JSON.stringify(res)}`)
  conn.close(() => process.exit(0))
})
sql.open(cs, (err, conn) => {
  if (err) throw err
  setTimeout(() => { log('TIMEOUT - hung'); process.exit(2) }, 10000)
  if (which === '4') {
    const q = conn.query(sql.PollingQuery(big))
    let rows = 0
    q.on('row', () => {
      if (++rows === 100) {
        q.pauseQuery()
        q.cancelQuery(e => {
          log(`cancel cb ${e ? e.message : 'no error'}`)
          followUp(conn)
        })
      }
    })
    trace(q)
  } else {
    const q = conn.query("waitfor delay '00:00:05'; select 1 as n")
    q.pauseQuery()
    q.cancelQuery(e => log(`cancel cb ${e ? e.message : 'no error'}`))
    trace(q)
    setTimeout(() => followUp(conn), 6000)
  }
})
