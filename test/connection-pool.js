
/* globals describe it */

const assert = require('assert')
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()

describe('connection-pool', function () {
  this.timeout(10000)

  this.beforeEach(done => {
    env.open().then(() => done())
  })

  this.afterEach(done => {
    env.close().then(() => done())
  })

  it('use pool for tvp insert', async function handler () {
    const pool = env.pool(4)
    await pool.promises.open()
    const tableName = 'TestTvp'
    const helper = env.tvpHelper(tableName, pool)
    const vec = helper.getExtendedVec(1)
    const table = await helper.create(tableName)
    table.addRowsFromObjects(vec)
    const tp = env.sql.TvpFromTable(table)
    const insertSql = helper.callProcWithTVpSql
    // 'exec insertTestTvp @tvp = ?;'
    await env.theConnection.promises.query(insertSql, [tp])
    const res = await env.theConnection.promises.query(`select * from ${tableName}`)
    assert.deepStrictEqual(res.first, vec)
    await pool.close()
  })

  it('submit error queries on pool with no on.error catch', async function handler () {
    const pool = env.pool(4)
    await pool.promises.open()
    const iterations = 8

    const testSql = 'select a;'
    for (let i = 0; i < iterations; ++i) {
      try {
        await pool.promises.query(testSql)
      } catch (e) {}
    }

    await pool.promises.close()
  })

  it('using promises to open, query, close pool', async function handler () {
    const size = 4
    const pool = env.pool(size)
    await pool.promises.open()
    const all = Array(100).fill(0).map((_, i) => pool.promises.query(`select ${i} as i, @@SPID as spid`))
    const promised = await Promise.all(all)
    const res = promised.map(r => r.first[0].spid)
    assert(res !== null)
    const set = new Set(res)
    assert.strictEqual(set.size, size)
    await pool.promises.close()
    return null
  })

  it('submit 10 queries with errors (no callback) to pool of 4', testDone => {
    const iterations = 10
    tester(iterations, 4, () => 'select a;', 2000, true, err => {
      assert.strictEqual(iterations, err.length)
      const expected = err.filter(e => {
        return e.message.includes('Invalid column name \'a\'')
      })
      assert.strictEqual(iterations, expected.length)
      testDone()
    })
  })

  it('submit error queries with callback for results', testDone => {
    const size = 4
    const iterations = 8
    const pool = new env.sql.Pool({
      connectionString: env.connectionString,
      ceiling: size
    })
    pool.on('error', e => {
      assert.ifError(e)
      errors.push(e)
    })
    pool.open()

    const checkin = []
    const checkout = []
    const errors = []
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
      })
    })

    let done = 0
    let free = 0
    function submit (sql) {
      const q = pool.query(sql, (e, res) => {
        errors.push(e)
      })
      q.on('submitted', () => {
        q.on('done', () => ++done)
        q.on('free', () => {
          ++free
          if (free === iterations) {
            assert(errors.length === iterations)
            assert(checkin.length === iterations)
            assert(checkout.length === iterations)
            pool.close(() => {
              testDone()
            })
          }
        })
      })
      return q
    }
    const testSql = 'select a;'
    for (let i = 0; i < iterations; ++i) {
      submit(testSql)
    }
  })

  it('submit queries with callback for results', testDone => {
    const size = 4
    const iterations = 8
    const pool = new env.sql.Pool({
      connectionString: env.connectionString,
      ceiling: size
    })
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
      })
    })

    let done = 0
    let free = 0
    const results = []
    function submit (sql) {
      const q = pool.query(sql, (e, res) => {
        assert.ifError(e)
        results.push(res)
      })
      q.on('submitted', () => {
        q.on('done', () => ++done)
        q.on('free', () => {
          ++free
          if (free === iterations) {
            assert(results.length === iterations)
            assert(checkin.length === iterations)
            assert(checkout.length === iterations)
            pool.close(() => {
              testDone()
            })
          }
        })
      })
      return q
    }
    const testSql = 'select top 100 * from master..syscomments'
    for (let i = 0; i < iterations; ++i) {
      submit(testSql)
    }
  })

  it('submit 1000 short queries to pool of 4 - expect concurrent queries and fast completion', testDone => {
    tester(1000, 4, () => 'select @@SPID as spid', 5000, 0, testDone)
  })

  it('open pool size 4 - submit queries on parked connections', testDone => {
    const size = 4
    const iterations = 4
    const pool = new env.sql.Pool({
      connectionString: env.connectionString,
      ceiling: size,
      heartbeatSecs: 1,
      inactivityTimeoutSecs: 3
    })

    pool.on('error', e => {
      assert.ifError(e)
    })

    pool.open()
    let opened = false
    const parked = []
    const checkin = []
    const checkout = []
    let done = 0
    let free = 0
    function submit (sql) {
      const q = pool.query(sql)
      q.on('submitted', () => {
        q.on('done', () => ++done)
        q.on('free', () => {
          ++free
          if (free === iterations) {
            pool.close()
          }
        })
      })
      return q
    }

    pool.on('open', (options) => {
      assert(options)
      opened = true
      pool.on('status', s => {
        switch (s.op) {
          case 'parked':
            parked.push(s)
            if (parked.length === size) {
              for (let i = 0; i < iterations; ++i) {
                submit('waitfor delay \'00:00:01\';')
              }
            }
            break
          case 'checkout':
            checkout.push(s)
            break
          case 'checkin':
            checkin.push(s)
            break
        }
      })
    })

    pool.on('close', () => {
      assert.strictEqual(size, parked[size - 1].parked)
      assert.strictEqual(0, parked[size - 1].idle)
      assert.strictEqual(true, opened)
      assert.strictEqual(size * 5, checkin.length) // 3 x 4 heartbeats + 1 x 4 'grow' + 1 x 4 queries
      // assert.strictEqual(size * 4, checkout.length)
      testDone()
    })
  })

  it('open pool size 4 - leave inactive so connections closed and parked', testDone => {
    const size = 4
    const pool = new env.sql.Pool({
      connectionString: env.connectionString,
      ceiling: size,
      heartbeatSecs: 1,
      inactivityTimeoutSecs: 3
    })

    pool.on('error', e => {
      assert.ifError(e)
    })

    pool.open()
    let opened = false
    const parked = []
    const checkin = []
    const checkout = []
    pool.on('open', (options) => {
      assert(options)
      opened = true
      pool.on('status', s => {
        switch (s.op) {
          case 'parked':
            parked.push(s)
            if (parked.length === size) {
              pool.close()
            }
            break
          case 'checkout':
            checkout.push(s)
            break
          case 'checkin':
            checkin.push(s)
            break
        }
      })
    })

    // with 3 second inactivity will checkout each connection 3 times for 3 heartbeats
    pool.on('close', () => {
      assert.strictEqual(size, parked[size - 1].parked)
      assert.strictEqual(0, parked[size - 1].idle)
      assert.strictEqual(true, opened)
      assert.strictEqual(size * 3, checkin.length)
      assert.strictEqual(size * 3, checkout.length)
      testDone()
    })
  })

  function pauseCancelTester (iterations, size, cancelled, strategy, expectedTimeToComplete, testDone) {
    const pool = new env.sql.Pool({
      connectionString: env.connectionString,
      ceiling: size
    })
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
      })
    })

    pool.on('close', () => {
      testDone()
    })

    let done = 0
    let free = 0

    function submit (sql) {
      const q = pool.query(sql)
      q.on('done', () => ++done)
      q.on('free', () => {
        ++free
        if (free === iterations) {
          assert.strictEqual(iterations - cancelled, checkout.length)
          assert.strictEqual(iterations - cancelled, checkin.length)
          assert.strictEqual(iterations, done)
          const elapsed = checkin[checkin.length - 1].time - checkout[0].time
          assert(elapsed <= expectedTimeToComplete + 1000)
          pool.close()
        }
      })
      return q
    }

    for (let i = 0; i < iterations; ++i) {
      const q = submit('waitfor delay \'00:00:01\';')
      strategy(i, q)
    }
  }

  /*
     1  =====> submitted and run in parallel, elapsed = 1000ms
     2  =====> submitted and run in parallel, elapsed = 1000ms
     3  =====> submitted and run in parallel, elapsed = 1000ms
     4  =====> submitted and run in parallel, elapsed = 1000ms
     5 ======> paused and resumed at ~+2000ms
     6,
     7 ======> run in parallel with 5 paused, elapsed = 2000ms
     .....
     5 ======> submits at ~2000 and completes at ~3000ms
   */
  it('submit 7 queries to pool of 4 connections - pause 1 and resume when only item left', testDone => {
    pauseCancelTester(7, 4, 0, (i, q) => {
      switch (i) {
        case 5:
          q.pauseQuery()
          setTimeout(() => {
            q.resumeQuery()
          }, 2100)
          break
        default:
          break
      }
    }, 3000, testDone)
  })

  it('submit 7 queries to pool of 4 connections - cancel 2 waiting on pool, expect 4 + 1 concurrent', testDone => {
    pauseCancelTester(7, 4, 2, (i, q) => {
      switch (i) {
        case 5:
        case 6:
          q.cancelQuery()
          break
        default:
          break
      }
    }, 2000, testDone)
  })

  // pause and resume before pool even gets to servicing
  it('submit 7 queries to pool of 4 connections - pause 1 and resume whilst waiting on queue', testDone => {
    pauseCancelTester(7, 4, 0, (i, q) => {
      switch (i) {
        case 5:
          q.pauseQuery()
          setTimeout(() => {
            q.resumeQuery()
          }, 500)
          break
        default:
          break
      }
    }, 2000, testDone)
  })

  function tester (iterations, size, renderSql, expectedTimeToComplete, expectErrors, testDone) {
    const pool = new env.sql.Pool({
      connectionString: env.connectionString,
      ceiling: size
    })
    pool.on('error', e => {
      if (!expectErrors) {
        assert.ifError(e)
      }
    })
    pool.open()

    const checkin = []
    const checkout = []
    const errors = []
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
      })
    })

    pool.on('close', () => {
      if (expectErrors) {
        testDone(errors)
      } else {
        testDone()
      }
    })

    let done = 0
    let free = 0

    function submit (sql) {
      const q = pool.query(sql)
      q.on('submitted', () => {
        q.on('done', () => ++done)
      })
      q.on('error', e => {
        errors.push(e)
      })
      q.on('free', () => {
        ++free
        if (checkin.length === iterations) {
          assert.strictEqual(iterations, checkout.length)
          assert.strictEqual(iterations, checkin.length)
          if (!expectErrors) assert.strictEqual(iterations, done)
          assert.strictEqual(iterations, free)
          assert.strictEqual(iterations, checkin.length)
          const elapsed = checkin[checkin.length - 1].time - checkout[0].time
          assert(elapsed <= expectedTimeToComplete + 1000)
          pool.close()
        }
      })
      return q
    }

    for (let i = 0; i < iterations; ++i) {
      submit(renderSql(i))
    }
  }

  it('submit 4 queries to pool of 2 connections - expect 2 x queue 2 x concurrent queries', testDone => {
    tester(4, 2, () => 'waitfor delay \'00:00:01\';', 2000, 0, testDone)
  })

  it('submit 4 queries to pool of 4 connections - expect 4 x concurrent queries', testDone => {
    tester(4, 4, i => `waitfor delay '00:00:0${i + 1}';`, 8000, 0, testDone)
  })

  it('open and close a pool with 2 connections without error', testDone => {
    const size = 2
    const pool = new env.sql.Pool({
      connectionString: env.connectionString,
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
})
