'use strict'
const { sql, cs, version } = require('./common')
const OK = 'select 1 as n'
const EXEC_ERROR = "raiserror('boom', 16, 1)"
const LATE_ERROR = "select 1 as n; raiserror('boom', 16, 1)"
const SLOW = "waitfor delay '00:00:02'; select 2 as n"
const show = (err, rows) => err ? `${err.sqlstate || ''} ${err.message}` : JSON.stringify(rows)
function recorder (resolve) {
  const t0 = Date.now()
  const out = []
  const giveUp = setTimeout(() => resolve([...out, '(gave up after 8 s)']), 8000)
  return {
    log: m => out.push(`+${String(Date.now() - t0).padStart(4)}ms ${m}`),
    finish: () => { clearTimeout(giveUp); setTimeout(() => resolve(out), 100) }
  }
}
function overlap (conn, q1Text, q1Params, when) {
  return new Promise(resolve => {
    const { log, finish } = recorder(resolve)
    let open = 2
    const follow = () => {
      for (const [name, text] of [['q2', SLOW], ['q3', 'select 3 as n']]) {
        const q = conn.query(text, (err, rows) => log(`${name} cb ${show(err, rows)}`))
        q.on('submitted', () => log(`${name} submitted`))
        q.on('free', () => { log(`${name} free`); if (--open === 0) finish() })
      }
    }
    const q1 = conn.query(q1Text, q1Params, err => log(`q1 cb ${err ? show(err) : 'ok'}`))
    q1.on('free', () => { log('q1 free'); if (when === 'on free') follow() })
    if (when === 'now') follow()
  })
}
function cancelLater (conn, q1Text) {
  return new Promise(resolve => {
    const { log, finish } = recorder(resolve)
    const q1 = conn.query(q1Text, err => log(`q1 cb ${err ? show(err) : 'ok'}`))
    q1.on('free', () => {
      log('q1 free')
      const q2 = conn.query(SLOW, (err, rows) => log(`q2 cb ${show(err, rows)}`))
      q2.on('submitted', () => setTimeout(() => {
        log('q2.cancelQuery()')
        q2.cancelQuery(e => log(`q2 cancel cb ${e ? e.message : 'no error'}`))
      }, 300))
      q2.on('done', () => log('q2 done'))
      q2.on('free', () => { log('q2 free'); finish() })
    })
  })
}
sql.open(cs, async (err, conn) => {
  if (err) throw err
  console.log(`msnodesqlv8 ${version} ${process.platform} node ${process.version}`)
  const runs = [
    ['A1 ok, q2/q3 queued at once', () => overlap(conn, 'select ? as v', [1], 'now')],
    ['A2 parameter fails to bind, q2/q3 queued at once', () => overlap(conn, 'select ? as v', [Infinity], 'now')],
    ['A3 ok, q2/q3 from q1 free', () => overlap(conn, OK, [], 'on free')],
    ['A4 error at execute, q2/q3 from q1 free', () => overlap(conn, EXEC_ERROR, [], 'on free')],
    ['A5 error after a result, q2/q3 from q1 free', () => overlap(conn, LATE_ERROR, [], 'on free')],
    ['B1 ok, cancel q2', () => cancelLater(conn, OK)],
    ['B2 error at execute, cancel q2', () => cancelLater(conn, EXEC_ERROR)]
  ]
  for (const [title, run] of runs) {
    console.log(`${title}\n  ${(await run()).join('\n  ')}`)
  }
  conn.close(() => {})
})
