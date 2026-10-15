'use strict'

// the event contract corpus: each scenario is a query plus what is done to it while it
// runs. its expected transcript lives in corpus/<name>.txt (see recorder.js for the
// line format). to add an edge case, add a scenario here and capture it:
//   node test/contract/capture.js --update <name filter>
// then read the transcript it wrote and edit it to what the contract should be.
//
// a scenario:
//   name      group/name - the corpus file, without the mode suffix
//   sql       the query text; params optional
//   setup     statements run first on the same connection
//   columns   also record each 'column' event with its value - only for small queries
//             whose values are the same on every server
//   at        actions while it runs:
//               start: [...]            straight after query()
//               row: { 51: [...] }      on the nth row (1 based, counted across result sets)
//               later: { 300: [...] }   ms after query()
//               free: [...]             just after 'free'
//             a follow-up can have its own 'at' as well.
//             actions: 'pause', 'resume', 'resume:50' (after 50 ms), 'cancel',
//             'queue:<when>' (start followUps with that when, now)
//   followUps queries put on the same connection: { label, sql, when: 'start' | 'free' }
//   modes     which variants to generate, each a separate corpus file:
//               events   listen to events only (how streaming consumers such as node-mssql read)
//               callback also pass a callback
//
// polling queries (sql.PollingQuery) are not covered: the contract is for ordinary queries.

const BIG = 'select top 5000 a.name from sys.all_objects a cross join sys.all_objects b'
const SLOW = "waitfor delay '00:00:01'; select 2 as n"
const DUP_TABLE = ['create table #t (id int constraint pk_t primary key); insert #t values (1)']
const TWO_51 = 'select top 51 object_id as a from sys.all_objects; select top 51 object_id as b from sys.all_objects'
const TYPES = "select 1 as i, N'x' as s, cast(1.5 as decimal(5, 2)) as d, cast('2020-01-02T03:04:05' as datetime2(0)) as dt, cast(null as int) as nul, 0x0102 as b, cast(1 as bit) as bt"

const BOTH = ['events', 'callback']
const EVENTS = ['events']

const base = [
  // ----- plain reads: the shapes every other group builds on
  { name: 'read/one-row', sql: 'select 1 as n', columns: true, modes: BOTH },
  { name: 'read/types', sql: TYPES, columns: true, modes: BOTH },
  { name: 'read/no-rows', sql: 'select top 0 1 as n', modes: BOTH },
  { name: 'read/two-result-sets', sql: 'select 1 as a; select 2 as b', columns: true, modes: BOTH },
  { name: 'read/two-rows-two-columns', sql: "select 1 as a, 'x' as b union all select 2, 'y'", columns: true, modes: BOTH },
  { name: 'read/rows-50', sql: 'select top 50 object_id as a from sys.all_objects', modes: EVENTS },
  { name: 'read/rows-51', sql: 'select top 51 object_id as a from sys.all_objects', modes: EVENTS },
  { name: 'read/two-by-51', sql: TWO_51, modes: EVENTS },
  { name: 'read/param', sql: 'select ? as v', params: [1], columns: true, modes: BOTH },
  { name: 'read/insert-rowcount', setup: ['create table #r (id int)'], sql: 'insert #r values (1)', modes: BOTH },
  { name: 'read/insert-then-select', setup: ['create table #r (id int)'], sql: 'insert #r values (1); select id from #r', columns: true, modes: BOTH },
  { name: 'read/print-then-select', sql: "print 'p1'; select 1 as n", columns: true, modes: BOTH },
  { name: 'read/select-then-print', sql: "select 1 as n; print 'p1'", columns: true, modes: BOTH },
  { name: 'read/print-only', sql: "print 'p1'", modes: BOTH },

  // ----- errors (#478, #475): the order of errors and infos, and 'more'
  { name: 'errors/raiserror-at-execute', sql: "raiserror('boom', 16, 1)", modes: BOTH },
  { name: 'errors/raiserror-after-result', sql: "select 1 as n; raiserror('boom', 16, 1)", columns: true, modes: BOTH },
  { name: 'errors/raiserror-then-result', sql: "raiserror('boom', 16, 1); select 2 as m", columns: true, modes: BOTH },
  { name: 'errors/print-then-raiserror', sql: "print 'p1'; raiserror('boom', 16, 1)", modes: BOTH },
  { name: 'errors/two-raiserrors-then-result', sql: "print 'p1'; raiserror('e1', 16, 1); print 'p2'; raiserror('e2', 16, 1); select 1 as n", columns: true, modes: BOTH },
  { name: 'errors/throw-ends-batch', sql: "select 1 as n; throw 50001, 'thrown', 1; select 2 as m", columns: true, modes: BOTH },
  { name: 'errors/syntax', sql: 'select from where', modes: BOTH },
  { name: 'errors/bind-failure', sql: 'select ? as v', params: [Infinity], modes: BOTH },
  { name: 'errors/dup-key-a', setup: DUP_TABLE, sql: 'insert #t values (1)', modes: BOTH },
  { name: 'errors/dup-key-b', setup: DUP_TABLE, sql: 'select 1 as n; insert #t values (1)', columns: true, modes: BOTH },
  { name: 'errors/dup-key-c', setup: DUP_TABLE, sql: 'select 1 as n; insert #t values (1); select 2 as m', columns: true, modes: BOTH },
  { name: 'errors/dup-key-d', setup: DUP_TABLE, sql: 'insert #t values (1); select 2 as m', columns: true, modes: BOTH },

  // ----- pause / resume (#480, #470): 51 rows is one full batch of 50 plus one
  ...[1, 49, 50, 51, 52, 101, 102].map(n => ({
    name: `pause/two-by-51-at-${n}`, sql: TWO_51, at: { row: { [n]: ['pause', 'resume:50'] } }, modes: EVENTS
  })),
  { name: 'pause/before-execute', sql: 'select 1 as n', at: { start: ['pause', 'resume:50'] }, modes: EVENTS },
  // back pressure as node streams apply it: pause on every row, resume shortly after
  { name: 'pause/every-row', sql: TWO_51, at: { row: Object.fromEntries(Array.from({ length: 102 }, (_, i) => [i + 1, ['pause', 'resume:1']])) }, modes: EVENTS },

  // ----- cancel (#479)
  { name: 'cancel/streaming-at-100', sql: BIG, at: { row: { 100: ['cancel'] } }, modes: EVENTS },
  { name: 'cancel/streaming-after-print-at-100', sql: `print 'start'; ${BIG}`, at: { row: { 100: ['cancel'] } }, modes: EVENTS },
  { name: 'cancel/paused-streaming-at-100', sql: BIG, at: { row: { 100: ['pause', 'cancel'] } }, modes: EVENTS },
  { name: 'cancel/before-execute', sql: SLOW, at: { start: ['cancel'] }, modes: EVENTS },
  { name: 'cancel/paused-before-execute', sql: SLOW, at: { start: ['pause', 'cancel'] }, modes: EVENTS },
  { name: 'cancel/during-execute', sql: SLOW, at: { later: { 300: ['cancel'] } }, modes: BOTH },
  { name: 'cancel/last-row', sql: 'select top 5 object_id as a from sys.all_objects', at: { row: { 5: ['cancel'] } }, modes: EVENTS },
  { name: 'cancel/late-after-free', sql: 'select 1 as n', at: { free: ['cancel'] }, modes: EVENTS },

  // ----- the connection's work queue (#481): a follow-up must not run until the
  // query before it has freed, whatever way that query ended
  ...[
    ['ok', 'select ? as v', [1]],
    ['bind-failure', 'select ? as v', [Infinity]],
    ['error-at-execute', "raiserror('boom', 16, 1)"],
    ['error-after-result', "select 1 as n; raiserror('boom', 16, 1)"]
  ].flatMap(([label, sql, params]) => ['start', 'free'].map(when => ({
    name: `queue/${label}-then-two-on-${when}`,
    sql,
    params,
    followUps: [{ label: 'q2', sql: SLOW, when, callback: true }, { label: 'q3', sql: 'select 3 as n', when, callback: true }],
    modes: ['callback']
  }))),
  ...[['ok', 'select 1 as n'], ['error-at-execute', "raiserror('boom', 16, 1)"]].map(([label, sql]) => ({
    name: `queue/${label}-then-cancel-follow-up`,
    sql,
    followUps: [{ label: 'q2', sql: SLOW, when: 'free', callback: true, at: { later: { 300: ['cancel'] } } }],
    modes: ['callback']
  }))
]

function expand (s) {
  return (s.modes ?? EVENTS).map(listen => ({
    ...s,
    name: `${s.name}.${listen}`,
    callback: listen === 'callback'
  }))
}

const scenarios = base.flatMap(expand)

module.exports = { scenarios }
