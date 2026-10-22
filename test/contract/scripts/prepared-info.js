'use strict'

// info from a prepared statement's executions: 8153 "null value is eliminated by an
// aggregate". the server sends it after the rows, but for a prepared execution the driver
// hands it to SQLExecute - short result or long - so it comes before the meta: ODBC does not
// say where in the stream it was. (the same query run directly gets it on the SQLFetch that
// returns SQL_NO_DATA, after its rows: see info/null-eliminated*.) it has to come with the
// execution that caused it, once, and only with that one: an execution without a null must
// not report it again.

module.exports = async t => {
  t.query('setup', 'create table #v (g int, x int); insert #v values (1, 1), (1, null), (2, 1), (2, 2)', null, { callback: true })
  await t.settled('setup')
  const ps = await new Promise((resolve, reject) => {
    t.conn.prepare('select sum(x) as s from #v where g = ?', (err, p) => err ? reject(err) : resolve(p))
  })

  t.section('A a null is eliminated: 8153')
  t.watch('ps', ps.preparedQuery([1]), { columns: true })
  await t.next('ps', 'done')

  t.section('B no null: no info, nothing left over from A')
  ps.preparedQuery([2])
  await t.next('ps', 'done')

  t.section('C a null again: 8153 again, once')
  ps.preparedQuery([1])
  await t.next('ps', 'done')

  await new Promise(resolve => ps.free(err => {
    t.log('ps', err ? `free-cb error ${err.message}` : 'free-cb ok')
    resolve()
  }))
  await t.delay(100)

  t.section('D a longer result (120 rows): 8153 at execute too')
  t.query('setup2', 'create table #w (g int, x int); insert #w select top 240 n % 120, case when n % 7 = 0 then null else 1 end from (select row_number() over (order by (select 1)) as n from sys.all_objects) t', null, { callback: true })
  await t.settled('setup2')
  const ps2 = await new Promise((resolve, reject) => {
    t.conn.prepare('select g, sum(x) as s from #w where g >= ? group by g order by g', (err, p) => err ? reject(err) : resolve(p))
  })
  t.watch('ps2', ps2.preparedQuery([0]))
  await t.next('ps2', 'done')
  await new Promise(resolve => ps2.free(() => resolve()))
  await t.delay(100)
}
