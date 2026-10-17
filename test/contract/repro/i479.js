'use strict'
const { sql, cs, version } = require('./common')
const big = 'select top 5000 a.name from sys.all_objects a cross join sys.all_objects b'
function trace (q, log) {
  q.on('error', (e, more) => log(`error ${e.sqlstate} ${e.message} more=${more}`))
  q.on('done', () => log('done'))
  q.on('free', () => log('free'))
}
function runningCancel (conn, text) {
  return new Promise(resolve => {
    const out = []
    let rows = 0
    const q = conn.query(text)
    q.on('row', () => {
      if (++rows === 100) {
        out.push('cancelQuery()')
        q.cancelQuery(e => out.push(`cancel cb: ${e ? e.message : 'no error'}`))
      }
    })
    trace(q, m => out.push(`${m} [rows=${rows}]`))
    q.on('free', () => setTimeout(() => resolve(out), 200))
  })
}
function lateCancel (conn) {
  return new Promise(resolve => {
    const out = []
    const q = conn.query('select 1 as n')
    trace(q, m => out.push(m))
    q.on('free', () => setTimeout(() => {
      out.push('cancelQuery()')
      q.cancelQuery(e => {
        out.push(`cancel cb: ${e ? e.message : 'no error'}`)
        setTimeout(() => resolve(out), 200)
      })
    }, 50))
  })
}
sql.open(cs, async (err, conn) => {
  if (err) throw err
  console.log(`msnodesqlv8 ${version} ${process.platform} node ${process.version}`)
  console.log('A running cancel\n  ' + (await runningCancel(conn, big)).join('\n  '))
  console.log('B late cancel\n  ' + (await lateCancel(conn)).join('\n  '))
  console.log('C running cancel after a print\n  ' + (await runningCancel(conn, `print 'start'; ${big}`)).join('\n  '))
  conn.close(() => {})
})
