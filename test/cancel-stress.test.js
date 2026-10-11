'use strict'

// stress: cancel non polling queries while rows are being fetched.
// Cancel() used to replace the statement's result set from the cancel thread while a
// worker thread was inside SQLFetch writing rows into it - a use after free that
// crashed the process now and then (seen on linux CI).
//
// runs a few iterations by default; for a real soak set e.g.
//   MSNODESQLV8_CANCEL_STRESS=500 npx mocha test/cancel-stress.test.js

import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()
const assert = require('chai').assert

const sql = require('../lib/sql')
const { configureTestLogging } = require('./common/logging-helper')
configureTestLogging(sql)

const iterations = Number(process.env.MSNODESQLV8_CANCEL_STRESS) || 20
// wide rows so each fetch spends longer writing into the result set
const streamingSql = `select top 500000 a.name, a.object_id, a.type_desc, a.create_date,
  b.name as name2, b.object_id as id2, cast(a.object_id as nvarchar(40)) + b.name as text1
  from sys.all_objects a cross join sys.all_objects b`

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

describe('cancel stress', function () {
  this.timeout(30000 + iterations * 2000)

  this.beforeEach(async () => {
    await env.open()
  })

  this.afterEach(async () => {
    await env.close()
  })

  async function assertUsable (conn) {
    const res = await conn.promises.query('select 1 as n')
    assert.strictEqual(res.first[0].n, 1)
  }

  // spread the cancel over the first moments of the fetch, including straight away
  const delayFor = i => (i * 37) % 150

  it(`q.promises.cancel while rows stream x ${iterations}`, async function handler () {
    const conn = env.theConnection
    for (let i = 0; i < iterations; ++i) {
      const q = conn.query(streamingSql)
      let rows = 0
      q.on('row', () => { ++rows })
      await sleep(delayFor(i))
      const err = await q.promises.cancel()
      assert.include(err.message, 'Operation canceled', `iteration ${i} after ${rows} rows`)
      await assertUsable(conn)
    }
  })

  it(`q.cancelQuery while rows stream x ${iterations}`, async function handler () {
    const conn = env.theConnection
    for (let i = 0; i < iterations; ++i) {
      let q
      const ended = new Promise(resolve => {
        q = conn.query(streamingSql, err => resolve(err))
      })
      await sleep(delayFor(i))
      await new Promise((resolve, reject) => q.cancelQuery(e => e ? reject(e) : resolve()))
      const err = await ended
      assert(err, `iteration ${i}: expected the query to end with an error`)
      assert.include(err.message, 'Operation canceled', `iteration ${i}`)
      await assertUsable(conn)
    }
  })

  it(`cancel while rows stream on several connections at once x ${iterations}`, async function handler () {
    const connections = await Promise.all([1, 2, 3].map(() => sql.promises.open(env.connectionString)))
    try {
      for (let i = 0; i < iterations; ++i) {
        await Promise.all(connections.map(async (conn, c) => {
          const q = conn.query(streamingSql)
          await sleep(delayFor(i + c * 11))
          const err = await q.promises.cancel()
          assert.include(err.message, 'Operation canceled', `iteration ${i} connection ${c}`)
          await assertUsable(conn)
        }))
      }
    } finally {
      await Promise.all(connections.map(c => c.promises.close()))
    }
  })
})
