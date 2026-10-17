'use strict'

// #479: on cancel, 'done' is emitted before the query has ended, and also when nothing was
// cancelled. dhensby's repro, A to C; and the two points from his comment on it: 4, a
// paused polling query cancelled, and 5, a query paused and cancelled before it executes.
// each case ends with a follow-up query, to show the connection is usable after it.

const BIG = 'select top 5000 a.name from sys.all_objects a cross join sys.all_objects b'

module.exports = async t => {
  const followUp = async label => {
    t.query(label, 'select 1 as n', null, { callback: true })
    await t.settled(label)
  }

  t.section('A running cancel, at row 100')
  t.query('A', BIG, null, { at: { row: { 100: ['cancel'] } } })
  await t.settled('A')
  await followUp('A.check')

  t.section('B late cancel, after free')
  t.query('B', 'select 1 as n', null, { at: { free: ['cancel'] } })
  await t.settled('B')
  await t.delay(100) // the cancel is made 20 ms after free
  await followUp('B.check')

  t.section('C running cancel after a print, at row 100')
  t.query('C', `print 'start'; ${BIG}`, null, { at: { row: { 100: ['cancel'] } } })
  await t.settled('C')
  await followUp('C.check')

  t.section('4 a polling query, paused and cancelled at row 100')
  t.query('P4', t.sql.PollingQuery(BIG), null, { at: { row: { 100: ['pause', 'cancel'] } } })
  await t.settled('P4')
  await followUp('P4.check')

  t.section('5 paused and cancelled before it executes')
  t.query('P5', "waitfor delay '00:00:05'; select 1 as n", null, { at: { start: ['pause', 'cancel'] } })
  await t.settled('P5')
  await followUp('P5.check')
}
