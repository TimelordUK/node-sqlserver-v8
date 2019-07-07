
/* global suite teardown teardown test setup */
'use strict'

const assert = require('assert')
const supp = require('../samples/typescript/demo-support')

suite('pause', function () {
  this.timeout(30 * 1000)
  const sql = global.native_sql

  let theConnection
  let connStr
  let support
  let helper
  let procedureHelper

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

  test('pause a large query to only get 10 rows then submit new query whilst other paused (first killed)', testDone => {
    const q = theConnection.query(`select top 3000 * from syscolumns`)
    const pauseAt = 10
    let rows = 0
    q.on('error', (e) => {
      assert.ifError(e)
    })
    q.on('row', () => {
      ++rows
      if (rows % 10 === 0) {
        q.pauseQuery()
        setTimeout(() => {
          assert.strictEqual(pauseAt, rows)
          // submit a new query will kill previous
          theConnection.query(`select top 3000 * from syscolumns`, (err, res) => {
            assert.ifError(err)
            assert(Array.isArray(res))
            testDone()
          })
        }, 200)
      }
    })
  })

  test('pause a large query to only get 10 rows', testDone => {
    const q = theConnection.query(`select top 3000 * from syscolumns`)
    const pauseAt = 10
    let rows = 0
    q.on('error', (e) => {
      assert.ifError(e)
    })
    q.on('row', () => {
      ++rows
      if (rows % 10 === 0) {
        q.pauseQuery()
        setTimeout(() => {
          assert.strictEqual(pauseAt, rows)
          // close connection will move to top of work q and paused query will be terminated
          testDone()
        }, 200)
      }
    })
  })

  test('run a large query', testDone => {
    const q = theConnection.query(`select * from syscolumns`)
    q.on('error', (e) => {
      assert.ifError(e)
    })
    q.on('row', () => {
    })
    q.on('done', () => {
      testDone()
    })
  })

  test('pause a large query every 100 rows', testDone => {
    let expected = 0
    const q0 = theConnection.query(`select top 3000 * from syscolumns`)
    q0.on('row', () => {
      ++expected
    })
    let rows = 0
    const q = theConnection.query(`select top 3000 * from syscolumns`)
    q.on('error', (e) => {
      assert.ifError(e)
    })
    q.on('row', () => {
      ++rows
      if (rows % 100 === 0) {
        q.pauseQuery()
        setTimeout(() => {
          q.resumeQuery()
        }, 50)
      }
    })
    q.on('done', () => {
      assert.strictEqual(expected, rows)
      testDone()
    })
  })
})
