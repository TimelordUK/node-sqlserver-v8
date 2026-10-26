'use strict'

// the event contract corpus: each scenario is a query plus what is done to it while it
// runs. its expected transcript lives in corpus/<name>.txt (see recorder.js for the
// line format). to add an edge case, add a scenario here and capture it:
//   node test/contract/capture.js --update <name filter>
// then read the transcript it wrote and edit it to what the contract should be.
//
// a scenario:
//   name      group/name - the corpus file, without the mode suffix
//   sql       the query text; params optional. '{unique}' in it is replaced on every run
//             (put it in a comment), so the server compiles the batch every time - a
//             warning raised at compile time is not raised again for a cached plan
//   setup     statements run first on the same connection
//   columns   also record each 'column' event with its value - only for small queries
//             whose values are the same on every server
//   at        actions while it runs:
//               start: [...]            straight after query()
//               row: { 51: [...] }      on the nth row (1 based, counted across result sets)
//               later: { 300: [...] }   ms after query()
//               free: [...]             just after 'free'
//               error: { 1: [...] }     on the nth error
//             a follow-up can have its own 'at' as well.
//             actions: 'pause', 'resume', 'resume:50' (after 50 ms), 'cancel',
//             'cancel:again' (and once more from its callback), 'cancel:pause' (and
//             pause from its callback),
//             'queue:<when>' (start followUps with that when, now)
//   followUps queries put on the same connection: { label, sql, when: 'start' | 'free' }
//   modes     which variants to generate, each a separate corpus file:
//               events   listen to events only (how streaming consumers such as node-mssql read)
//               callback also pass a callback
//
// polling queries (sql.PollingQuery) are not covered: the contract is for ordinary queries.
//
// a scenario can also be a script, for what a scenario cannot say: several queries in
// sequence, several cases in one transcript, a repro taken from an issue. each file in
// scripts/ is the scenario scripts/<file name>; see scripts/README.md for what it gets.
// npm run record-corpus <file> copies a script there and records it.

const fs = require('fs')
const path = require('path')

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
  // one statement, two errors (1779 then 1750): only the last error has more=false
  { name: 'errors/two-errors-one-statement', setup: DUP_TABLE, sql: 'alter table #t add constraint pk_t2 primary key (id)', modes: BOTH },

  // ----- info: everything the driver sends must reach the caller, in the server's order.
  // the server raises a message as part of the statement that caused it, but the driver
  // hands it over on whichever ODBC call reads that part of the stream - SQLExecDirect,
  // SQLFetch, SQLMoreResults, SQLNumResultCols, SQLRowCount ... - so these vary where the
  // message falls: before, between and after results, after rows, after errors.
  // where
  { name: 'info/print-between-results', sql: "select 1 as a; print 'p1'; select 2 as b", columns: true, modes: BOTH },
  { name: 'info/print-after-rows', sql: "select top 3 x from (values (1), (2), (3)) t(x); print 'p1'", columns: true, modes: BOTH },
  { name: 'info/prints-around-everything', sql: "print 'p1'; select 1 as a; print 'p2'; print 'p3'; select 2 as b; print 'p4'", columns: true, modes: BOTH },
  { name: 'info/print-after-error', sql: "raiserror('e1', 16, 1); print 'p1'; select 1 as n", columns: true, modes: BOTH },
  { name: 'info/print-after-error-at-end', sql: "select 1 as n; raiserror('e1', 16, 1); print 'p1'", columns: true, modes: BOTH },
  { name: 'info/print-after-insert', setup: ['create table #r (id int)'], sql: "insert #r values (1); print 'p1'", modes: BOTH },
  // raiserror below severity 11 is info, whatever its number
  { name: 'info/raiserror-severity-0', sql: "raiserror('i0', 0, 1); select 1 as n", columns: true, modes: BOTH },
  { name: 'info/raiserror-severity-10', sql: "raiserror('i10', 10, 1); select 1 as n", columns: true, modes: BOTH },
  { name: 'info/raiserror-info-then-error', sql: "raiserror('i10', 10, 1); raiserror('e16', 16, 1); select 1 as n", columns: true, modes: BOTH },
  { name: 'info/raiserror-nowait', sql: "raiserror('now', 0, 1) with nowait; waitfor delay '00:00:00.2'; select 1 as n", columns: true, modes: BOTH },
  // warnings the server raises itself, not PRINT
  // 8153: arrives at the end of the rows that caused it, i.e. on a fetch
  { name: 'info/null-eliminated', sql: 'select sum(x) as s from (values (1), (cast(null as int))) t(x)', columns: true, modes: BOTH },
  { name: 'info/null-eliminated-many-rows', sql: 'select g, sum(x) as s from (select top 200 row_number() over (order by (select 1)) % 120 as g, case when row_number() over (order by (select 1)) % 7 = 0 then null else 1 end as x from sys.all_objects) t group by g order by g', modes: EVENTS },
  { name: 'info/null-eliminated-then-select', sql: 'select sum(x) as s from (values (1), (cast(null as int))) t(x); select 2 as n', columns: true, modes: BOTH },
  // 1756: a DDL warning raised when the batch is compiled. the 2026-10-18 handover had it as
  // lost almost every time: it was the plan cache - the server only raises it on a compile
  { name: 'info/fk-on-temp-table', sql: '/* {unique} */ create table #fk (id int constraint fk_x references no_such_table(id))', modes: BOTH },
  { name: 'info/fk-on-temp-table-then-select', sql: '/* {unique} */ create table #fk (id int constraint fk_x references no_such_table(id)); select 1 as n', columns: true, modes: BOTH },
  // the same batch with its plan cached: the server sends no 1756, so none is expected
  { name: 'info/fk-on-temp-table-cached', setup: ['create table #fk (id int constraint fk_x references no_such_table(id)); drop table #fk'], sql: 'create table #fk (id int constraint fk_x references no_such_table(id)); drop table #fk', modes: EVENTS },
  // 3607: with ansi_warnings and arithabort off a divide by zero is info (after the row), and null
  { name: 'info/divide-by-zero-warning', sql: 'set ansi_warnings off; set arithabort off; select 1 / 0 as n; set ansi_warnings on; set arithabort on', columns: true, modes: BOTH },
  // 3606: an overflow with the same settings is info too
  { name: 'info/overflow-warning', sql: 'set ansi_warnings off; set arithabort off; select cast(300 as tinyint) as n; set ansi_warnings on; set arithabort on', columns: true, modes: BOTH },
  // a warning on a row part way through, not at the end: on that row's fetch, or at the end
  { name: 'info/warning-mid-rows', sql: `set ansi_warnings off; set arithabort off; select top 120 1 / case when n = 75 then 0 else 1 end as v from (select row_number() over (order by (select 1)) as n from sys.all_objects) t; set ansi_warnings on; set arithabort on`, modes: BOTH },
  // a warning in a result that is not the last, then an error, then more
  { name: 'info/warning-then-error-then-result', sql: "select sum(x) as s from (values (1), (cast(null as int))) t(x); raiserror('e16', 16, 1); select 2 as n", columns: true, modes: BOTH },
  // the warning comes with the batch's last fetch: paused before it, it waits for the resume
  { name: 'info/warning-paused-on-last-row', sql: 'select g, sum(x) as s from (select top 200 row_number() over (order by (select 1)) % 120 as g, case when row_number() over (order by (select 1)) % 7 = 0 then null else 1 end as x from sys.all_objects) t group by g order by g', at: { row: { 120: ['pause', 'resume:50'] } }, modes: EVENTS },
  { name: 'info/warning-paused-mid-batch', sql: 'select g, sum(x) as s from (select top 200 row_number() over (order by (select 1)) % 120 as g, case when row_number() over (order by (select 1)) % 7 = 0 then null else 1 end as x from sys.all_objects) t group by g order by g', at: { row: { 110: ['pause', 'resume:50'] } }, modes: EVENTS },
  // more messages than fit in one packet: none lost, none reordered
  { name: 'info/many-prints', sql: "declare @i int = 0; while @i < 60 begin print cast(@i as varchar(3)) + ' ' + replicate('x', 200); set @i += 1 end; select 1 as n", columns: true, modes: EVENTS },
  { name: 'info/many-prints-between-results', sql: "select 1 as a; declare @i int = 0; while @i < 60 begin print cast(@i as varchar(3)) + ' ' + replicate('x', 200); set @i += 1 end; select 2 as b", columns: true, modes: EVENTS },
  // inside a procedure
  {
    name: 'info/proc-prints',
    setup: ["create procedure #p as begin print 'in'; select 1 as n; print 'between'; select 2 as m; print 'out' end"],
    sql: 'exec #p',
    columns: true,
    modes: BOTH
  },
  {
    name: 'info/proc-warning-then-error',
    setup: ["create procedure #p as begin select sum(x) as s from (values (1), (cast(null as int))) t(x); raiserror('e16', 16, 1) end"],
    sql: 'exec #p',
    columns: true,
    modes: BOTH
  },

  // ----- pause / resume (#480, #470): 51 rows is one full batch of 50 plus one
  ...[1, 49, 50, 51, 52, 101, 102].map(n => ({
    name: `pause/two-by-51-at-${n}`, sql: TWO_51, at: { row: { [n]: ['pause', 'resume:50'] } }, modes: EVENTS
  })),
  { name: 'pause/before-execute', sql: 'select 1 as n', at: { start: ['pause', 'resume:50'] }, modes: EVENTS },
  // back pressure as node streams apply it: pause on every row, resume shortly after
  // a pause that lands while a native call is in flight: what that call brings back waits
  // for the resume. the server sends nothing of a batch until a waitfor in it is over,
  // unless what comes before fills a packet - so the first two are paused while the query
  // executes, the third while a fetch (of the rows buffered behind the waitfor) is in flight.
// timed: the pause comes from a timer, so how the rows split around it depends on timing
// (the explorer then compares the shape and the total of rows, not the split)
  { name: 'pause/during-execute-then-error', sql: "select 1 as n; waitfor delay '00:00:00.300'; raiserror('boom', 16, 1)", at: { later: { 100: ['pause', 'resume:300'] } }, modes: EVENTS },
  { name: 'pause/during-execute-then-result', sql: "select 1 as a; waitfor delay '00:00:00.300'; select 2 as b", at: { later: { 100: ['pause', 'resume:300'] } }, modes: EVENTS },
  { name: 'pause/during-fetch', sql: "select top 1000 a.name from sys.all_objects a cross join sys.all_objects b; waitfor delay '00:00:00.400'; select 2 as b", at: { later: { 200: ['pause', 'resume:300'] } }, timed: true, modes: EVENTS },
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
  // a failed statement mid batch: the rest of the batch still runs, so it can be cancelled
  // a cancel repeated: one done, and every cancel's callback is called - none left dangling
  { name: 'cancel/twice-before-execute', sql: SLOW, at: { start: ['cancel', 'cancel'] }, modes: EVENTS },
  { name: 'cancel/twice-during-execute', sql: SLOW, at: { later: { 300: ['cancel', 'cancel'] } }, modes: EVENTS },
  { name: 'cancel/twice-streaming-at-100', sql: BIG, at: { row: { 100: ['cancel', 'cancel'] } }, modes: EVENTS },
  { name: 'cancel/again-after-confirm-at-100', sql: BIG, at: { row: { 100: ['cancel:again'] } }, modes: EVENTS },
  { name: 'cancel/again-after-confirm-during-execute', sql: SLOW, at: { later: { 300: ['cancel:again'] } }, modes: EVENTS },
  { name: 'cancel/paused-twice-at-100', sql: BIG, at: { row: { 100: ['pause', 'cancel', 'cancel'] } }, modes: EVENTS },
  { name: 'cancel/paused-again-after-confirm-at-100', sql: BIG, at: { row: { 100: ['pause', 'cancel:again'] } }, modes: EVENTS },
  { name: 'cancel/paused-resumed-after-cancel-at-100', sql: BIG, at: { row: { 100: ['pause', 'cancel', 'resume:50'] } }, modes: EVENTS },
  // a pause after an accepted cancel, while the rows already fetched are still emitted
  // (#513): the cancel still ends the query, and the pause does not hold the connection
  { name: 'cancel/paused-after-cancel-at-10-20', sql: BIG, at: { row: { 10: ['cancel'], 20: ['pause'] } }, modes: EVENTS },
  { name: 'cancel/paused-in-cancel-cb-at-10', sql: BIG, at: { row: { 10: ['cancel:pause'] } }, modes: EVENTS },
  { name: 'cancel/paused-before-execute-twice', sql: SLOW, at: { start: ['pause', 'cancel', 'cancel'] }, modes: EVENTS },
  { name: 'cancel/after-error-mid-batch', sql: `raiserror('boom', 16, 1); ${SLOW}`, at: { error: { 1: ['cancel'] } }, modes: EVENTS },

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
  })),
  // a paused query holds the connection: work submitted while it is paused is refused
  // (HY010), work queued before the pause waits its turn - after a resume or a cancel
  {
    name: 'queue/paused-then-submit',
    sql: 'select top 20 object_id as a from sys.all_objects',
    at: { row: { 10: ['pause', 'queue:paused', 'resume:100'] } },
    followUps: [{ label: 'q2', sql: 'select 2 as n', when: 'paused', callback: true }],
    modes: ['callback']
  },
  {
    name: 'queue/paused-then-cancel-queued-before',
    sql: TWO_51,
    at: { row: { 3: ['pause'] }, later: { 300: ['cancel'] } },
    followUps: [{ label: 'q2', sql: 'select 2 as n', when: 'start', callback: true }],
    modes: ['events']
  },
  {
    name: 'queue/paused-then-resume-queued-before',
    sql: TWO_51,
    at: { row: { 3: ['pause', 'resume:100'] } },
    followUps: [{ label: 'q2', sql: 'select 2 as n', when: 'start', callback: true }],
    modes: ['events']
  }
]

function expand (s) {
  return (s.modes ?? EVENTS).map(listen => ({
    ...s,
    name: `${s.name}.${listen}`,
    callback: listen === 'callback'
  }))
}

const SCRIPTS_DIR = path.join(__dirname, 'scripts')
function scripted () {
  if (!fs.existsSync(SCRIPTS_DIR)) return []
  return fs.readdirSync(SCRIPTS_DIR)
    .filter(f => f.endsWith('.js'))
    .sort()
    .map(f => ({ name: `scripts/${f.slice(0, -3)}`, script: path.join(SCRIPTS_DIR, f) }))
}

const scenarios = [...base.flatMap(expand), ...scripted()]

module.exports = { scenarios }
