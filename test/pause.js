'use strict'

const assert = require('chai').assert

/* globals describe it */

const { TestEnv } = require('./env/test-env')
const env = new TestEnv()

describe('pause', function () {
  this.timeout(30000)

  this.beforeEach(done => {
    env.open().then(() => done())
  })

  this.afterEach(done => {
    env.close().then(() => done())
  })

  it('resume query having never paused', testDone => {
    let expected = 0
    const sql = 'select top 3000 * from syscolumns'
    const q0 = env.theConnection.query(sql)
    q0.on('row', () => {
      ++expected
    })
    let rows = 0
    const q = env.theConnection.query(sql)
    q.on('error', (e) => {
      assert.ifError(e)
    })
    q.on('row', () => {
      ++rows
      q.resumeQuery()
    })
    q.on('done', () => {
      assert.strictEqual(expected, rows)
      testDone()
    })
  })

  it('pause a closed query', testDone => {
    const expected = 1
    let rows = 0
    const sql = 'select \'hello\''
    const q = env.theConnection.query(sql)
    q.on('error', (e) => {
      assert.ifError(e)
    })
    q.on('row', () => {
      ++rows
    })
    q.on('done', () => {
      assert.strictEqual(expected, rows)
      q.pauseQuery() // make sure nothing goes wrong
      testDone()
    })
  })

  it('pause a paused query that is about to close', testDone => {
    let expected = 0
    const sql = 'select \'hello\''
    const q0 = env.theConnection.query(sql)
    q0.on('row', () => {
      ++expected
    })
    let rows = 0
    const q = env.theConnection.query(sql)
    q.on('error', (e) => {
      assert.ifError(e)
    })
    q.on('row', () => {
      ++rows
      q.pauseQuery()
      q.pauseQuery()
    })
    q.on('done', () => {
      assert.strictEqual(expected, rows)
      testDone()
    })
  })

  it('pause a large query and cancel without resume', testDone => {
    let rows = 0
    const q = env.theConnection.query('select top 3000 * from syscolumns')
    q.on('error', (e) => {
      assert.ifError(e)
    })
    q.on('row', () => {
      ++rows
      if (rows % 100 === 0) {
        q.pauseQuery()
        setTimeout(() => {
          q.cancelQuery(() => {
            testDone()
          })
        }, 50)
      }
    })
  })

  it('pause a large query to only get 10 rows then submit new query whilst other paused (first killed)', testDone => {
    const q = env.theConnection.query('select top 3000 * from syscolumns')
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
          env.theConnection.query('select top 3000 * from syscolumns', (err, res) => {
            assert.ifError(err)
            assert(Array.isArray(res))
            testDone()
          })
        }, 200)
      }
    })
  })

  it('pause a large query to only get 10 rows', testDone => {
    const q = env.theConnection.query('select top 3000 * from syscolumns')
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

  it('queries can start off paused', testDone => {
    const q = env.theConnection.query('select top 3000 * from syscolumns')
    q.pauseQuery()
    let rows = 0
    q.on('error', (e) => {
      assert.ifError(e)
    })
    q.on('row', () => {
      ++rows
    })
    setTimeout(() => {
      // make sure no rows were received
      assert.strictEqual(0, rows)
      testDone()
    }, 200)
  })

  it('run a large query', testDone => {
    const q = env.theConnection.query('select * from syscolumns')
    q.on('error', (e) => {
      assert.ifError(e)
    })
    q.on('row', () => {
    })
    q.on('done', () => {
      testDone()
    })
  })

  it('pause a large query every 100 rows', testDone => {
    let expected = 0
    const sql = 'select top 3000 * from syscolumns'
    const q0 = env.theConnection.query(sql)
    q0.on('row', () => {
      ++expected
    })
    let rows = 0
    const q = env.theConnection.query(sql)
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

  it('pause a large query every 100 rows - submit new query', testDone => {
    let expected = 0
    const sql1 = 'select top 3000 * from syscolumns'
    const q0 = env.theConnection.query(sql1)
    q0.on('row', () => {
      ++expected
    })
    let rows = 0
    const q = env.theConnection.query(sql1)
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
      env.theConnection.query(sql1, (err, res) => {
        assert.ifError(err)
        assert.strictEqual(expected, res.length)
        testDone()
      })
    })
  })

  it('close connection with paused query pending a resume', testDone => {
    env.sql.open(env.connectionString, (err, newConn) => {
      assert(err === false)
      const q = newConn.query('select top 3000 * from syscolumns')
      q.pauseQuery()
      let rows = 0
      q.on('error', (e) => {
        assert.ifError(e)
      })
      q.on('row', () => {
        ++rows
      })
      setTimeout(() => {
        // make sure no rows were received
        assert.strictEqual(0, rows)
        newConn.close(() => {
          testDone()
        })
      }, 1000)
    })
  })

  it('pause a large query and cancel without resume - submit new query', testDone => {
    let rows = 0
    const q = env.theConnection.query('select top 3000 * from syscolumns')
    q.on('error', (e) => {
      assert.ifError(e)
    })
    q.on('row', () => {
      ++rows
      if (rows % 100 === 0) {
        q.pauseQuery()
        setTimeout(() => {
          q.cancelQuery(() => {
            env.theConnection.query('select top 3000 * from syscolumns', (err, res) => {
              assert.ifError(err)
              assert(res.length > 0)
              testDone()
            })
          })
        }, 50)
      }
    })
  })
})
