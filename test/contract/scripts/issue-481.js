'use strict'

// #481: after a query fails, the connection's work queue advanced once too often, so later
// queries could overlap. dhensby's repro: q1 ends one way or another, then q2 (slow) and
// q3 are queued, at once or from q1's 'free'. q3 must not be submitted until q2 is done.
// B: from q1's 'free', a slow q2 that is cancelled 300 ms after it starts - it must still
// be cancellable when q1 failed.

const SLOW = "waitfor delay '00:00:01'; select 2 as n"

module.exports = async t => {
  const overlap = async (name, sql, params, when) => {
    t.section(`${name}: q2 and q3 queued ${when === 'now' ? 'at once' : 'from q1 free'}`)
    const follow = () => {
      t.query(`${name}.q2`, SLOW, null, { callback: true })
      t.query(`${name}.q3`, 'select 3 as n', null, { callback: true })
    }
    const q1 = t.query(`${name}.q1`, sql, params, { callback: true })
    if (when === 'now') follow()
    else q1.once('free', follow)
    await t.settled(`${name}.q1`)
    await t.settled(`${name}.q2`)
    await t.settled(`${name}.q3`)
  }

  await overlap('A1 ok', 'select ? as v', [1], 'now')
  await overlap('A2 bind failure', 'select ? as v', [Infinity], 'now')
  await overlap('A3 ok', 'select 1 as n', null, 'free')
  await overlap('A4 error at execute', "raiserror('boom', 16, 1)", null, 'free')
  await overlap('A5 error after a result', "select 1 as n; raiserror('boom', 16, 1)", null, 'free')

  const cancelLater = async (name, sql) => {
    t.section(`${name}: from q1 free, a slow q2 cancelled after 300 ms`)
    const q1 = t.query(`${name}.q1`, sql, null, { callback: true })
    let q2started
    const q2 = new Promise(resolve => { q2started = resolve })
    q1.once('free', () => {
      t.query(`${name}.q2`, SLOW, null, { callback: true, at: { later: { 300: ['cancel'] } } })
      q2started()
    })
    await t.settled(`${name}.q1`)
    await q2
    await t.settled(`${name}.q2`)
  }

  await cancelLater('B1 ok', 'select 1 as n')
  await cancelLater('B2 error at execute', "raiserror('boom', 16, 1)")
}
