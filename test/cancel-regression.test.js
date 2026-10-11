'use strict'

// regression tests for cancel, timeout and pause. every case checks the two things
// that have gone wrong before but which a check on the error message alone misses:
//  - the server really stopped the statement (it ends long before the waitfor would)
//  - the connection is still usable afterwards (no 'Connection is busy', no hang)

import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()
const assert = require('chai').assert

const sql = require('../lib/sql')
const { configureTestLogging } = require('./common/logging-helper')
configureTestLogging(sql)

const waitSecs = 20
// well short of waitSecs, so a pass proves the server cancelled the statement
const cancelledWithinMs = 5000
const repeats = 3

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function assertUsable (conn) {
  const res = await conn.promises.query('select 1 as n')
  assert.strictEqual(res.first[0].n, 1)
}

function assertCancelled (err, startedAt) {
  assert(err, 'expected an error from the cancelled query')
  assert.include(err.message, 'Operation canceled')
  assert.isBelow(Date.now() - startedAt, cancelledWithinMs, 'query was not cancelled on the server')
}

// resolve with the error the query finished with, via its callback
function queryEnded (conn, query) {
  let q
  const ended = new Promise(resolve => {
    q = conn.query(query, err => resolve(err))
  })
  return { q, ended }
}

function cancelCb (q) {
  return new Promise((resolve, reject) => q.cancelQuery(err => err ? reject(err) : resolve()))
}

describe('cancel regression', function () {
  this.timeout(60000)

  this.beforeEach(async () => {
    await env.open()
  })

  this.afterEach(async () => {
    await env.close()
  })

  const polling = () => sql.PollingQuery(env.waitForSql(waitSecs))
  const nonPolling = () => env.waitForSql(waitSecs)

  for (const [label, make] of [['polling', polling], ['non polling', nonPolling]]) {
    it(`${label}: q.promises.cancel while executing, connection usable after`, async function handler () {
      const conn = env.theConnection
      for (let i = 0; i < repeats; ++i) {
        const startedAt = Date.now()
        const q = conn.query(make())
        await sleep(300)
        const err = await q.promises.cancel()
        assertCancelled(err, startedAt)
        await assertUsable(conn)
      }
    })

    it(`${label}: q.promises.cancel straight after submit, connection usable after`, async function handler () {
      const conn = env.theConnection
      for (let i = 0; i < repeats; ++i) {
        const startedAt = Date.now()
        const q = conn.query(make())
        const err = await q.promises.cancel()
        assertCancelled(err, startedAt)
        await assertUsable(conn)
      }
    })

    it(`${label}: q.cancelQuery while executing, connection usable after`, async function handler () {
      const conn = env.theConnection
      for (let i = 0; i < repeats; ++i) {
        const startedAt = Date.now()
        const { q, ended } = queryEnded(conn, make())
        await sleep(300)
        await cancelCb(q)
        assertCancelled(await ended, startedAt)
        await assertUsable(conn)
      }
    })

    it(`${label}: promises.query timeoutMs cancels, connection usable after`, async function handler () {
      const conn = env.theConnection
      for (let i = 0; i < repeats; ++i) {
        const startedAt = Date.now()
        let err = null
        try {
          await conn.promises.query(make(), [], { timeoutMs: 500 })
        } catch (e) {
          err = e
        }
        assert(err, 'expected timeout error')
        assert.isBelow(Date.now() - startedAt, cancelledWithinMs, 'query was not cancelled on the server')
        await assertUsable(conn)
      }
    })

    it(`${label}: pause before execution ends then q.promises.cancel, connection usable after`, async function handler () {
      const conn = env.theConnection
      const startedAt = Date.now()
      const q = conn.query(make())
      q.pauseQuery()
      await sleep(300)
      const err = await q.promises.cancel()
      assertCancelled(err, startedAt)
      await assertUsable(conn)
    })
  }

  it('cancel a query streaming rows, connection usable after', async function handler () {
    const conn = env.theConnection
    const q = conn.query('select top 200000 a.name from sys.all_objects a cross join sys.all_objects b')
    let rows = 0
    q.on('row', () => { ++rows })
    await sleep(200)
    const err = await q.promises.cancel()
    assert.include(err.message, 'Operation canceled')
    assert.isBelow(rows, 200000)
    await assertUsable(conn)
  })

  // a pool query has no q.promises (yet), so cancel with the callback
  for (const [label, make] of [['polling', polling], ['non polling', nonPolling]]) {
    it(`pool: ${label} q.cancelQuery on a running query, pool usable after`, async function handler () {
      const pool = env.pool(1) // one connection, so the follow up query reuses it
      await pool.promises.open()
      try {
        for (let i = 0; i < repeats; ++i) {
          const startedAt = Date.now()
          const { q, ended } = queryEnded(pool, make())
          await sleep(300)
          await cancelCb(q)
          assertCancelled(await ended, startedAt)
          const res = await pool.promises.query('select 1 as n')
          assert.strictEqual(res.first[0].n, 1)
        }
      } finally {
        await pool.promises.close()
      }
    })
  }
})

describe('pause regression', function () {
  this.timeout(30000)

  this.beforeEach(async () => {
    await env.open()
  })

  this.afterEach(async () => {
    await env.close()
  })

  // rows are fetched 50 at a time - a pause inside the last, partial batch must not
  // let 'done' / 'free' through before the remaining rows of that batch.
  function pauseEvery (conn, top, every) {
    return new Promise((resolve, reject) => {
      const q = conn.query(`select top ${top} name from sys.all_objects`)
      let rows = 0
      let rowsAtDone = -1
      q.on('error', reject)
      q.on('row', () => {
        if (++rows % every === 0) {
          q.pauseQuery()
          setTimeout(() => q.resumeQuery(), 50)
        }
      })
      q.on('done', () => { rowsAtDone = rows })
      q.on('free', () => resolve({ rows, rowsAtDone }))
    })
  }

  for (const [top, every] of [[6, 3], [20, 10], [70, 65], [120, 30], [200, 7]]) {
    it(`top ${top} pause every ${every}: done only after every row, connection usable after`, async function handler () {
      const conn = env.theConnection
      const { rows, rowsAtDone } = await pauseEvery(conn, top, every)
      assert.strictEqual(rows, top)
      assert.strictEqual(rowsAtDone, top, `'done' raised after ${rowsAtDone} of ${top} rows`)
      await assertUsable(conn)
    })
  }
})
