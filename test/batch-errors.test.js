'use strict'

// a statement failing part way through a batch (raiserror severity 11 - 16, a failed
// insert, ...) does not end the batch: SQL Server runs the statements after it. the
// driver used to stop at the first error, losing every print, error and result set
// that followed, and never raising 'done'.
// errors that do end the batch (throw, conversion errors, timeouts) must still end it.
// ('done' is not raised when a batch ends on an error - that is unchanged here, so those
// tests don't assert on it either way.)

import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()
const assert = require('chai').assert

const sql = require('../lib/sql')
const { configureTestLogging } = require('./common/logging-helper')
configureTestLogging(sql)

const strip = message => message.replace(/^(\[[^\]]*\])+/, '')

const twoErrorsBatch = `
print 'p1'
raiserror('e1', 16, 1)
print 'p2'
raiserror('e2', 16, 1)
print 'p3'
select 1 as n`

// every event the query raises, in order
function events (conn, query) {
  return new Promise(resolve => {
    const ev = []
    const q = conn.query(query)
    q.on('info', m => ev.push(`info ${strip(m.message)}`))
    q.on('error', (e, more) => ev.push(`error ${strip(e.message)} more=${more}`))
    q.on('meta', m => ev.push(`meta ${m.map(c => c.name).join(',')}`))
    q.on('column', (c, v) => ev.push(`column ${v}`))
    q.on('done', () => ev.push('done'))
    q.on('free', () => resolve(ev))
  })
}

// every call of the query's callback, in order
function callbacks (conn, query) {
  return new Promise(resolve => {
    const calls = []
    conn.query(query, (err, rows, more) => {
      calls.push({ err: err ? strip(err.message) : null, rows, more })
      if (!more) resolve(calls)
    })
  })
}

async function assertUsable (conn) {
  const res = await conn.promises.query('select 1 as n')
  assert.strictEqual(res.first[0].n, 1)
}

describe('errors part way through a batch', function () {
  this.timeout(30000)

  this.beforeEach(async () => {
    await env.open()
  })

  this.afterEach(async () => {
    await env.close()
  })

  for (const [label, make] of [['polling', q => sql.PollingQuery(q)], ['non polling', q => q]]) {
    it(`${label}: prints, errors and rows after a failed statement all arrive`, async function handler () {
      const ev = await events(env.theConnection, make(twoErrorsBatch))
      assert.deepStrictEqual(ev, [
        'info p1',
        'error e1 more=true',
        'info p2',
        'error e2 more=true',
        'info p3',
        'meta n',
        'column 1',
        'done'
      ])
      await assertUsable(env.theConnection)
    })
  }

  it('promise rejects with the last error, carrying everything else', async function handler () {
    const err = await env.theConnection.promises.query(twoErrorsBatch).then(() => null, e => e)
    assert(err, 'expected the query to reject')
    assert.strictEqual(strip(err.message), 'e2')
    const res = err._results
    assert.deepStrictEqual(res.errors.map(e => strip(e.message)), ['e1', 'e2'])
    assert.deepStrictEqual(res.info.map(strip), ['p1', 'p2', 'p3'])
    assert.deepStrictEqual(res.first, [{ n: 1 }])
    await assertUsable(env.theConnection)
  })

  it('callback: more is true until the batch really ends', async function handler () {
    const calls = await callbacks(env.theConnection, twoErrorsBatch)
    assert.deepStrictEqual(calls.filter(c => c.err).map(c => c.err), ['e1', 'e2'])
    assert(calls.slice(0, -1).every(c => c.more), 'only the last call should have more=false')
    const last = calls.at(-1)
    assert.strictEqual(last.more, false)
    assert.deepStrictEqual(last.rows, [{ n: 1 }])
  })

  it('result sets either side of an error are both returned', async function handler () {
    const err = await env.theConnection.promises.query(`
      select 1 as a
      raiserror('in the middle', 16, 1)
      select 2 as b`).then(() => null, e => e)
    assert.strictEqual(strip(err.message), 'in the middle')
    assert.deepStrictEqual(err._results.results, [[{ a: 1 }], [{ b: 2 }]])
  })

  it('a failed insert does not stop the rest of the batch', async function handler () {
    const err = await env.theConnection.promises.query(`
      declare @t table (id int primary key)
      insert into @t values (1)
      insert into @t values (1)
      insert into @t values (2)
      select id from @t order by id`).then(() => null, e => e)
    assert.include(err.message, 'PRIMARY KEY')
    assert.deepStrictEqual(err._results.first, [{ id: 1 }, { id: 2 }])
  })

  it('stored procedure: statements after a raiserror run, output and return arrive', async function handler () {
    const conn = env.theConnection
    const name = 'test_batch_errors_proc'
    await conn.promises.query(`if object_id('${name}') is not null drop procedure ${name}`)
    await conn.promises.query(`
      create procedure ${name} @out int output
      as
      begin
        set nocount on
        select 'started' as step
        print 'before'
        raiserror('proc failed a step', 16, 1)
        print 'after'
        set @out = 42
        select 'still here' as status
        return 7
      end`)
    try {
      const err = await conn.promises.callProc(name, {}).then(() => null, e => e)
      assert.strictEqual(strip(err.message), 'proc failed a step')
      const res = err._results
      assert.deepStrictEqual(res.info.map(strip), ['before', 'after'])
      assert.deepStrictEqual(res.results, [[{ step: 'started' }], [{ status: 'still here' }]])
      assert.deepStrictEqual(res.output, [7, 42])
      await assertUsable(conn)
    } finally {
      await conn.promises.query(`drop procedure ${name}`)
    }
  })

  // when the very first result of a batch is the error, SQLExecDirect itself fails. on
  // linux / macOS the unixODBC driver manager then answers SQLMoreResults with
  // SQL_NO_DATA without asking the driver, so the batch ends there. on windows it goes on.
  it('error as the first result: windows carries on, unixODBC ends the batch', async function handler () {
    const err = await env.theConnection.promises.query(`
      raiserror('first thing fails', 16, 1)
      print 'after'
      select 1 as n`).then(() => null, e => e)
    assert.strictEqual(strip(err.message), 'first thing fails')
    const res = err._results
    if (process.platform === 'win32') {
      assert.deepStrictEqual(res.info.map(strip), ['after'])
      assert.deepStrictEqual(res.first, [{ n: 1 }])
    } else {
      assert.isNull(res.info)
      assert.deepStrictEqual(res.results, [])
    }
    await assertUsable(env.theConnection)
  })

  it('a print in the same diagnostics as the final error is not dropped', async function handler () {
    const conn = env.theConnection
    const name = 'test_batch_errors_info'
    await conn.promises.query(`if object_id('${name}') is not null drop procedure ${name}`)
    // inside a proc with nocount on, the print and the throw arrive together
    await conn.promises.query(`
      create procedure ${name}
      as
      begin
        set nocount on
        print 'about to throw'
        ;throw 50002, 'thrown in proc', 1
      end`)
    try {
      const err = await conn.promises.callProc(name, {}).then(() => null, e => e)
      assert.strictEqual(strip(err.message), 'thrown in proc')
      assert.deepStrictEqual(err._results.info.map(strip), ['about to throw'])
      await assertUsable(conn)
    } finally {
      await conn.promises.query(`drop procedure ${name}`)
    }
  })

  it('throw ends the batch: nothing after it runs', async function handler () {
    const ev = await events(env.theConnection, `
      print 'p1'
      ;throw 50001, 'thrown', 1
      print 'never'
      select 1 as never`)
    assert.deepStrictEqual(ev.filter(e => e !== 'done'), ['info p1', 'error thrown more=false'])
    await assertUsable(env.theConnection)
  })

  it('a batch aborting conversion error ends the batch', async function handler () {
    const ev = await events(env.theConnection, `
      print 'p1'
      select cast('oops' as int) as n
      print 'never'`)
    assert.strictEqual(ev[0], 'info p1')
    assert(ev.some(e => e.startsWith('error') && e.includes('Conversion failed')), ev.join('\n'))
    assert(!ev.includes('info never'), ev.join('\n'))
    await assertUsable(env.theConnection)
  })

  it('several compile errors are still all reported', async function handler () {
    const ev = await events(env.theConnection, 'select no_such_column_a; select no_such_column_b')
    assert.deepStrictEqual(ev.filter(e => e !== 'done'), [
      "error Invalid column name 'no_such_column_a'. more=true",
      "error Invalid column name 'no_such_column_b'. more=false"
    ])
    await assertUsable(env.theConnection)
  })

  it('a timeout ends the batch: the statements after it do not run', async function handler () {
    const ev = await events(env.theConnection, {
      query_str: "waitfor delay '00:00:10'; print 'never'",
      query_timeout: 1
    })
    assert(ev.some(e => e.includes('Query timeout expired')), ev.join('\n'))
    assert(!ev.includes('info never'), ev.join('\n'))
    await assertUsable(env.theConnection)
  })
})
