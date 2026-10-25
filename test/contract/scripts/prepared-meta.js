'use strict'

// meta in a prepared statement's events. prepare raises no events: the columns it could
// describe come back as ps.getMeta(). each execution raises its own meta, before its rows,
// as a query does - also when the server could not describe the result at prepare, which is
// then described and bound once the execution has run: a parameter that decides a column's
// type (11521), a temp table in a batch (11525), or column encryption enabled (the corpus
// connection), where the driver describes nothing at prepare.

const prepare = (t, sql) => new Promise((resolve, reject) => {
  t.conn.prepare(sql, (err, p) => err ? reject(err) : resolve(p))
})

module.exports = async t => {
  t.query('setup', 'create table #m (id int); insert #m values (1), (2)', null, { callback: true })
  await t.settled('setup')

  t.section('A a parameter decides the column type: each execution has its own')
  const a = await prepare(t, 'select ? as n')
  t.log('a', `getMeta ${a.getMeta().map(m => m.name).join(',') || '(none)'}`)
  t.watch('a', a.preparedQuery([2]), { columns: true })
  await t.next('a', 'done')
  a.preparedQuery(['abc'])
  await t.next('a', 'done')
  await new Promise(resolve => a.free(() => resolve()))
  await t.delay(50)

  t.section('B an insert, then a result: no meta for the insert, meta for the result')
  const b = await prepare(t, 'insert #m values (?); select count(*) as c from #m')
  t.watch('b', b.preparedQuery([3]), { columns: true })
  await t.next('b', 'done')
  b.preparedQuery([4])
  await t.next('b', 'done')
  await new Promise(resolve => b.free(() => resolve()))
  await t.delay(50)

  t.section('C two results of different types, twice')
  const c = await prepare(t, "select id from #m where id = ?; select 'x' as s, 2.5 as d")
  t.watch('c', c.preparedQuery([1]), { columns: true })
  await t.next('c', 'done')
  c.preparedQuery([2])
  await t.next('c', 'done')
  await new Promise(resolve => c.free(() => resolve()))
  await t.delay(50)
}
