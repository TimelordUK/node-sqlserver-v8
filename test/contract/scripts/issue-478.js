'use strict'

// #478: a failed statement's info messages are emitted before its error. dhensby's repro:
// a duplicate key insert raises 2627, and the server follows it with 3621 "The statement
// has been terminated." The error should come first, as the driver gives them. the
// constraint is named, so the message is the same on every server.

module.exports = async t => {
  t.query('setup', 'create table #t (id int constraint pk_t primary key); insert #t values (1)', null, { callback: true })
  await t.settled('setup')
  const cases = {
    A: 'insert #t values (1)',
    B: 'select 1 as n; insert #t values (1)',
    C: 'select 1 as n; insert #t values (1); select 2 as m',
    D: 'insert #t values (1); select 2 as m'
  }
  for (const [label, sql] of Object.entries(cases)) {
    t.section(`${label} ${sql}`)
    t.query(label, sql)
    await t.settled(label)
  }
}
