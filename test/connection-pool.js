
/* globals describe it */

const chai = require('chai')
const assert = chai.assert
const expect = chai.expect
chai.use(require('chai-as-promised'))
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

  it('open close pool with promises', async function handler () {
    const pool = env.pool()
    await pool.promises.open()
    await pool.promises.close()
  })

  it('submit query to closed pool - expect reject via notifier', async function handler () {
    const pool = env.pool()
    await pool.promises.open()
    await pool.promises.close()

    function tester () {
      return new Promise((resolve, reject) => {
        let error = null
        const q = pool.query('select @@SPID as spid')
        q.on('error', e => {
          error = e
        })

        q.on('done', () => {
          if (!error) reject(new Error('no error down listener'))
          if (!error.message.includes('closed')) reject(new Error('no error down listener'))
          resolve()
        })
      })
    }

    await tester()
  })

  it('submit promised query to closed pool - expect reject', async function handler () {
    const pool = env.pool()
    await pool.promises.open()
    await pool.promises.close()
    await expect(pool.promises.query('select @@SPID as spid')).to.be.rejectedWith('closed')
  })

  it('submit query to closed pool with callback - expect error on cb', async function handler () {
    const pool = env.pool()
    await pool.promises.open()
    await pool.promises.close()
    pool.query('select @@SPID as spid', async function handler (e) {
      assert(e !== null)
      assert(e.message.includes('closed'))
    })
  })

  it('submit query to pool with callback', async function handler () {
    const pool = env.pool()
    await pool.promises.open()
    let cb = false
    const n = pool.query('select @@SPID as spid', async function handler (e, r) {
      assert.ifError(e)
      assert(r !== null)
      assert(r[0].spid !== null)
      cb = true
    })
    n.on('done', async function handler () {
      assert(cb)
      await pool.promises.close()
    })
  })

  it('submit bad query to pool with callback - expect error on cb', async function handler () {
    const pool = env.pool()
    await pool.promises.open()
    pool.query('select a from b', async function handler (e) {
      assert(e !== null)
      assert(e.message.includes('Invalid object'))
      await pool.promises.close()
    })
  })

  it('use pool to call proc', async function handler () {
    const pool = env.pool()
    await pool.promises.open()
    const spName = 'test_sp_get_optional_p'
    const a = 10
    const b = 20
    const def = `alter PROCEDURE <name> (
      @a INT = ${a},
      @b INT = ${b},
      @plus INT out
      )
    AS begin
      -- SET XACT_ABORT ON;
      SET NOCOUNT ON;
      set @plus = @a + @b;
    end;
`
    await env.promisedCreate(spName, def)
    const expected = [
      0,
      a + b
    ]
    const o = {}
    const res = await pool.promises.callProc(spName, o)
    expect(res.output).to.be.deep.equal(expected)
    await pool.promises.close()
  })

  it('use tableMgr on pool bulk insert varchar vector - exactly 4000 chars', async function handler () {
    const pool = env.pool(4)
    await pool.promises.open()
    const b = env.repeat('z', 4000)
    const helper = env.typeTableHelper('NVARCHAR(MAX)', pool)
    const expected = helper.getVec(10, _ => b)
    const table = await helper.create()
    const promisedInsert = table.promises.insert
    const promisedSelect = table.promises.select

    await promisedInsert(expected)
    const res = await promisedSelect(expected)
    expect(res).to.be.deep.equals(expected)
    await pool.promises.close()
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
    await pool.promises.query(insertSql, [tp])
    // use a connection having inserted with pool
    const res = await pool.promises.query(`select * from ${tableName}`)
    expect(res.first).to.be.deep.equal(vec)
    await pool.promises.close()
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
    expect(set.size).to.be.equal(size)
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
    const pool = env.pool(size)

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
      const q = pool.query(sql, (e) => {
        errors.push(e)
      })
      q.on('submitted', () => {
        q.on('done', () => ++done)
        q.on('free', () => {
          ++free
          if (free === iterations) {
            expect(errors.length).to.equal(iterations)
            expect(checkin.length).to.equal(iterations)
            expect(checkout.length).to.equal(iterations)
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
    const pool = env.pool(size)
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
            expect(results.length).to.equal(iterations)
            expect(checkin.length).to.equal(iterations)
            expect(checkout.length).to.equal(iterations)
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

  it('submit 500 short queries to pool of 4 - expect concurrent queries and fast completion', testDone => {
    tester(500, 4, () => 'select @@SPID as spid', 5000, 0, testDone)
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
      expect(parked[size - 1].parked).to.equal(size)
      expect(parked[size - 1].idle).to.equal(0)
      expect(opened).to.be.equal(true)
      expect(checkin.length).to.be.equal(size * 5) // 3 x 4 heartbeats + 1 x 4 'grow' + 1 x 4 queries
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
    const pool = env.pool(size)
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
    const pool = env.pool(size)

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
    const pool = env.pool(size)

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
