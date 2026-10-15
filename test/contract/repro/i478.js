'use strict'
const { sql, cs, version } = require('./common')
const events = (conn, text) => new Promise(resolve => {
  const ev = []
  const q = conn.query(text)
  q.on('meta', () => ev.push('meta'))
  q.on('info', m => ev.push(`info ${m.code}`))
  q.on('error', (e, more) => ev.push(`error ${e.code} more=${more}`))
  q.on('done', () => ev.push('done'))
  q.on('free', () => { ev.push('free'); resolve(ev) })
})
const run = (conn, text) => new Promise((resolve, reject) =>
  conn.query(text, (e, rows, more) => { if (e) reject(e); else if (!more) resolve() }))
sql.open(cs, async (err, conn) => {
  if (err) throw err
  await run(conn, 'create table #t (id int primary key); insert #t values (1)')
  const cases = {
    A: 'insert #t values (1)',
    B: 'select 1 as n; insert #t values (1)',
    C: 'select 1 as n; insert #t values (1); select 2 as m',
    D: 'insert #t values (1); select 2 as m'
  }
  for (const [k, text] of Object.entries(cases)) {
    console.log(version, process.platform, k, (await events(conn, text)).join(' > '))
  }
  conn.close(() => {})
})
