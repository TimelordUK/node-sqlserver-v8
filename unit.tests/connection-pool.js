
/* global suite teardown teardown test setup */
'use strict'

const assert = require('assert')
const supp = require('../samples/typescript/demo-support')

suite('connection-pool', function () {
  this.timeout(30 * 1000)
  const sql = global.native_sql

  let theConnection
  let connStr
  let support
  let helper
  let procedureHelper
  const connectionString = 'Driver={ODBC Driver 13 for SQL Server};Server=(localdb)\\node;Database=scratch;Trusted_Connection=yes;'

  setup(done => {
    supp.GlobalConn.init(sql, co => {
      connStr = global.conn_str || co.conn_str
      support = co.support
      procedureHelper = new support.ProcedureHelper(connStr)
      procedureHelper.setVerbose(false)
      helper = co.helper
      helper.setVerbose(false)
      sql.open(connStr, (err, newConn) => {
        assert(err === false)
        theConnection = newConn
        done()
      })
    }, global.conn_str)
  })

  teardown(done => {
    theConnection.close(err => {
      assert.ifError(err)
      done()
    })
  })

  test('open and close a pool with 2 connections without error', testDone => {
    const size = 2
    const pool = new sql.Pool({
      connectionString: connectionString,
      ceiling: size
    })

    pool.on('error', e => {
      assert.ifError(e)
    })
    pool.open()

    pool.on('status', s => {
      switch (s.op) {
        case 'checkout':
          checkout.push(s)
          break
        // the initial pool creates done prior to the open event
        case 'checkin':
          checkin.push(s)
          break
      }
    })

    const checkin = []
    const checkout = []
    pool.on('open', () => {
      pool.close()
    })

    pool.on('close', () => {
      assert.strictEqual(size, checkin.length)
      assert.strictEqual(0, checkout.length)
      testDone()
    })
  })

  test('submit 4 queries to pool of 4 connections - expect concurrent queries', testDone => {
    const pool = new sql.Pool({
      connectionString: connectionString
    })
    const iterations = 4
    pool.on('error', e => {
      assert.ifError(e)
    })
    pool.open()

    const checkin = []
    const checkout = []
    pool.on('open', () => {
      pool.on('status', s => {
        switch (s.op) {
          case 'checkout':
            checkout.push(s)
            break
          case 'checkin':
            checkin.push(s)
            break
        }

        if (checkin.length === iterations) {
          assert.strictEqual(iterations, checkout.length)
          assert.strictEqual(iterations, checkin.length)
          assert.strictEqual(iterations, done)
          const elapsed = checkin[checkin.length - 1].time - checkout[0].time
          assert(elapsed >= 4000 && elapsed <= 5000)
          pool.close()
        }
      })
    })

    pool.on('close', () => {
      testDone()
    })

    let done = 0

    function submit (sql) {
      const q = pool.query(sql)
      q.on('submitted', () => {
        q.on('done', () => ++done)
      })
      return q
    }

    for (let i = 0; i < iterations; ++i) {
      submit(`waitfor delay '00:00:0${i + 1}';`)
    }
  })
})
