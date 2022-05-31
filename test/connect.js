'use strict'

/* globals describe it */

const assert = require('assert')
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()
const sql = require('msnodesqlv8')
const connectionString = env.connectionString

describe('connection tests', function () {
  this.timeout(10000)

  this.beforeEach(done => {
    env.open().then(() => done())
  })

  this.afterEach(done => {
    env.close().then(() => done())
  })

  it('connection closes OK in sequence with query', done => {
    sql.open(connectionString,
      (err, conn) => {
        const expected = [{
          n: 1
        }]
        assert(err === null || err === false)
        conn.query('SELECT 1 as n', (err, results) => {
          assert.ifError(err)
          assert.deepStrictEqual(results, expected)
          conn.close(() => {
            done()
          })
        })
      })
  })

  it('verify closed connection throws an exception', done => {
    sql.open(connectionString, (err, conn) => {
      assert(err === null || err === false)
      conn.close(() => {
        let thrown = false
        try {
          conn.query('SELECT 1', err => {
            assert.ifError(err)
          })
        } catch (e) {
          assert.deepStrictEqual(e, new Error('[msnodesql] Connection is closed.'))
          thrown = true
        }
        assert(thrown)
        done()
      })
    })
  })

  it('verify connection is not closed prematurely until a query is complete', done => {
    sql.open(connectionString, (err, conn) => {
      assert(err === null || err === false)
      const stmt = conn.queryRaw('select 1')
      stmt.on('meta', () => {
      })
      stmt.on('column', (c, d) => {
        assert(c === 0 && d === 1)
      })
      stmt.on('error', err => {
        assert(err === null || err === false)
      })
      stmt.on('row', r => {
        assert(r === 0)
        conn.close(() => {
          done()
        })
      })
    })
  })

  it('verify that close immediately flag only accepts booleans', done => {
    sql.open(connectionString, (err, conn) => {
      assert(err === null || err === false)
      let thrown = false
      try {
        conn.close('SELECT 1', err => {
          assert(err === null || err === false)
        })
      } catch (e) {
        assert.deepStrictEqual(e, new Error('[msnodesql] Invalid parameters passed to close.'))
        thrown = true
      }
      conn.close(() => {
        assert(thrown)
        done()
      })
    })
  })
})
