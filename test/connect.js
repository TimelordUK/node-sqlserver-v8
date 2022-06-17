'use strict'

/* globals describe it */

const assert = require('chai').assert
const expect = require('chai').expect
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()
const sql = require('msnodesqlv8')
const connectionString = env.connectionString

describe('connection', function () {
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
          expect(results).to.deep.equal(expected)
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
        expect(() => {
          conn.query('SELECT 1', err => {
            assert.ifError(err)
          })
        }).throws('[msnodesql] Connection is closed.')
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
      expect(() => {
        conn.close('SELECT 1', err => {
          assert(err === null || err === false)
        })
      }).throws('[msnodesql] Invalid parameters passed to close.')

      conn.close(() => {
        done()
      })
    })
  })
})
