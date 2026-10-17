'use strict'

// regression: table manager bulk operations run each batch in a transaction.
// a batch is one execute with an array per column, but under autocommit the server
// committed every row separately - around 650 rows/sec - and a failure part way
// through left the earlier rows committed.

import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()
const assert = require('chai').assert

const sql = require('../lib/sql')
const { configureTestLogging } = require('./common/logging-helper')
configureTestLogging(sql)

const tableName = 'test_bulk_transaction'

function makeRows (count, firstId = 1) {
  return Array.from({ length: count }, (_, i) => ({
    id: firstId + i,
    name: `row ${firstId + i}`,
    amount: i
  }))
}

describe('bulk transaction', function () {
  this.timeout(60000)

  this.beforeEach(async () => {
    await env.open()
    await createTable(env.theConnection)
  })

  this.afterEach(async () => {
    await env.theConnection.promises.query(`if object_id('${tableName}') is not null drop table ${tableName}`)
    await env.close()
  })

  async function createTable (conn) {
    await conn.promises.query(`if object_id('${tableName}') is not null drop table ${tableName}`)
    await conn.promises.query(`create table ${tableName} (
      id int primary key,
      name nvarchar(50) not null,
      amount int not null check (amount >= 0))`)
    // the table definition is cached, so drop it as the table is re-created
    conn.tableMgr().clear()
  }

  async function count (conn) {
    const res = await conn.promises.query(`select count(*) as n from ${tableName}`)
    return res.first[0].n
  }

  // a bulk op must never leave a transaction open behind it
  async function assertNoOpenTransaction (conn) {
    const res = await conn.promises.query('select @@trancount as n')
    assert.strictEqual(res.first[0].n, 0, 'transaction left open')
  }

  async function expectFailure (promise) {
    let err = null
    try {
      await promise
    } catch (e) {
      err = e
    }
    assert(err, 'expected the bulk operation to fail')
    return err
  }

  it('insert 10000 rows is not committed row by row', async function handler () {
    const conn = env.theConnection
    const t = await conn.promises.getTable(tableName)
    const startedAt = Date.now()
    await t.promises.insert(makeRows(10000))
    const ms = Date.now() - startedAt
    assert.strictEqual(await count(conn), 10000)
    // row by row commits took ~15s for this; one transaction takes well under 1s
    assert.isBelow(ms, 5000, `insert took ${ms} ms`)
    await assertNoOpenTransaction(conn)
  })

  it('insert failing part way leaves no rows', async function handler () {
    const conn = env.theConnection
    const t = await conn.promises.getTable(tableName)
    const rows = makeRows(500)
    rows[300].id = rows[10].id // duplicate key
    await expectFailure(t.promises.insert(rows))
    assert.strictEqual(await count(conn), 0)
    await assertNoOpenTransaction(conn)
  })

  it('setBatchSize: each batch commits on its own, a failed batch leaves none of its rows', async function handler () {
    const conn = env.theConnection
    const t = await conn.promises.getTable(tableName)
    t.setBatchSize(100)
    const rows = makeRows(500)
    rows[250].id = rows[0].id // duplicate key in the third batch
    await expectFailure(t.promises.insert(rows))
    assert.strictEqual(await count(conn), 200)
    await assertNoOpenTransaction(conn)
  })

  it('update failing part way changes no rows', async function handler () {
    const conn = env.theConnection
    const t = await conn.promises.getTable(tableName)
    await t.promises.insert(makeRows(100))
    t.setUpdateCols([{ name: 'amount' }])
    const changes = makeRows(100).map(r => ({ id: r.id, amount: 1000 }))
    changes[50].amount = -1 // fails the check constraint
    await expectFailure(t.promises.update(changes))
    const res = await conn.promises.query(`select count(*) as n from ${tableName} where amount = 1000`)
    assert.strictEqual(res.first[0].n, 0)
    await assertNoOpenTransaction(conn)
  })

  it('delete runs in a transaction and leaves none open', async function handler () {
    const conn = env.theConnection
    const t = await conn.promises.getTable(tableName)
    const rows = makeRows(200)
    await t.promises.insert(rows)
    await t.promises.delete(t.keys(rows.slice(0, 150)))
    assert.strictEqual(await count(conn), 50)
    await assertNoOpenTransaction(conn)
  })

  it('caller beginTransaction is respected - rollback removes the bulk insert', async function handler () {
    const conn = env.theConnection
    const t = await conn.promises.getTable(tableName)
    await conn.promises.beginTransaction()
    await t.promises.insert(makeRows(300))
    assert.strictEqual(await count(conn), 300)
    await conn.promises.rollback()
    assert.strictEqual(await count(conn), 0)
    await assertNoOpenTransaction(conn)
  })

  it('caller beginTransaction is respected - commit keeps the bulk insert', async function handler () {
    const conn = env.theConnection
    const t = await conn.promises.getTable(tableName)
    await conn.promises.beginTransaction()
    await t.promises.insert(makeRows(300))
    await conn.promises.commit()
    assert.strictEqual(await count(conn), 300)
    await assertNoOpenTransaction(conn)
  })

  it('caller transaction begun in sql is respected - rollback removes the bulk insert', async function handler () {
    const conn = env.theConnection
    const t = await conn.promises.getTable(tableName)
    await conn.promises.query('begin transaction')
    await t.promises.insert(makeRows(300))
    await conn.promises.query('rollback transaction')
    assert.strictEqual(await count(conn), 0)
    await assertNoOpenTransaction(conn)
  })

  it('bcp insert is unaffected', async function handler () {
    const conn = env.theConnection
    const t = await conn.promises.getTable(tableName)
    t.setUseBcp(true)
    await t.promises.insert(makeRows(5000))
    assert.strictEqual(await count(conn), 5000)
    await assertNoOpenTransaction(conn)
  })

  it('pool: insert is fast, a failure leaves no rows, connections left with no open transaction', async function handler () {
    const pool = env.pool(2)
    await pool.promises.open()
    try {
      const t = await pool.promises.getTable(tableName)
      const startedAt = Date.now()
      await t.promises.insert(makeRows(5000))
      assert.isBelow(Date.now() - startedAt, 5000)

      const bad = makeRows(500, 10001)
      bad[400].id = bad[0].id
      await expectFailure(t.promises.insert(bad))
      const res = await pool.promises.query(`select count(*) as n from ${tableName}`)
      assert.strictEqual(res.first[0].n, 5000)

      // every pooled connection is back in autocommit with nothing open
      const checks = await Promise.all([1, 2, 3, 4].map(() => pool.promises.query('select @@trancount as n')))
      checks.forEach(r => assert.strictEqual(r.first[0].n, 0))
    } finally {
      await pool.promises.close()
    }
  })
})
