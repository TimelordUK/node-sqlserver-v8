'use strict'

// a prepared statement's lifecycle. its executions share one query object (ps.preparedQuery
// returns it each time), so it is watched once, as 'ps'. each execution is submitted and
// done; free comes only from ps.free(), when the native statement is released. after
// that, any use of the statement is an error.
//
// on a table: a select with no table behind it (select 10 / ? as n) is described with no
// columns when prepared, so its executions return no rows - a separate bug.

// the driver's [vendor][driver] prefixes vary by driver and version
const strip = m => m.replace(/^(\[[^\]]*\]\s*)+/, '')

module.exports = async t => {
  const cb = label => (err, rows, more) => {
    if (err) t.log(label, `cb error ${strip(err.message)} more=${more}`)
    else t.log(label, `cb ok rows=${rows ? rows.length : 'null'} more=${more}`)
  }
  t.query('setup', 'create table #p (n int); insert #p values (1), (2), (0)', null, { callback: true })
  await t.settled('setup')
  const ps = await new Promise((resolve, reject) => {
    t.conn.prepare('select 10 / n as r from #p where n = ?', (err, p) => err ? reject(err) : resolve(p))
  })
  t.section('A an execution')
  t.watch('ps', ps.preparedQuery([1]), { columns: true })
  await t.next('ps', 'done')

  t.section('B a second execution')
  ps.preparedQuery([2])
  await t.next('ps', 'done')

  t.section('C an execution with a callback')
  ps.preparedQuery([1], cb('C'))
  await t.next('ps', 'done')

  t.section('D an execution that fails at execute (divide by zero)')
  ps.preparedQuery([0])
  await t.next('ps', 'done')

  t.section('E it still runs after a failure')
  ps.preparedQuery([2])
  await t.next('ps', 'done')

  t.section('F free')
  await new Promise(resolve => ps.free(err => {
    t.log('ps', err ? `free-cb error ${strip(err.message)}` : 'free-cb ok')
    resolve()
  }))
  await t.delay(100)

  t.section('G executions after free')
  ps.preparedQuery([1], cb('G'))
  await t.delay(200)
  ps.preparedQuery([1])
  await t.delay(200)

  t.section('H free again')
  await new Promise(resolve => {
    ps.free(err => {
      t.log('ps', err ? `free-cb error ${strip(err.message)}` : 'free-cb ok')
      resolve()
    })
    setTimeout(() => { t.log('ps', 'no free callback after 1 s'); resolve() }, 1000)
  })

  t.section('J free asked for while an execution runs: the execution ends, then free')
  const ps2 = await new Promise((resolve, reject) => {
    t.conn.prepare('select n from #p where n > ?', (err, p) => err ? reject(err) : resolve(p))
  })
  t.watch('ps2', ps2.preparedQuery([0]))
  ps2.free(err => t.log('ps2', err ? `free-cb error ${strip(err.message)}` : 'free-cb ok'))
  await t.next('ps2', 'free')
  await t.delay(100)

  t.section('I the connection still works')
  t.query('I', 'select 1 as n', null, { callback: true })
  await t.settled('I')
}
