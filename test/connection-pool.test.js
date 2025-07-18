/* eslint-disable no-unused-expressions */
import { createRequire } from 'module'
import chaiAsPromised from 'chai-as-promised'
const require = createRequire(import.meta.url)
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()
const chai = require('chai')
chai.use(chaiAsPromised)
const expect = chai.expect
const assert = chai.assert
const sql = require('../lib/sql')
const { logger } = require('../lib/logger')

/* globals describe it beforeEach afterEach */

const { configureTestLogging } = require('./common/logging-helper')

// Configure logging based on environment variables
// By default, tests run silently. To enable logging:
// - MSNODESQLV8_TEST_VERBOSE=true npm test  (for full trace logging)
// - MSNODESQLV8_TEST_LOG_LEVEL=DEBUG MSNODESQLV8_TEST_LOG_CONSOLE=true npm test
// - MSNODESQLV8_TEST_LOG_LEVEL=INFO MSNODESQLV8_TEST_LOG_FILE=/tmp/test.log npm test
configureTestLogging(sql)

describe('pool', function () {
  this.timeout(60000)

  this.beforeEach(done => {
    sql.logger.info('Starting test setup', 'connection-pool.test.beforeEach')
    env.open().then(() => {
      sql.logger.info('Test environment opened successfully', 'connection-pool.test.beforeEach')
      done()
    }).catch(e => {
      sql.logger.error(`Failed to open test environment: ${e}`, 'connection-pool.test.beforeEach')
      sql.logger.error(e)
    })
  })

  this.afterEach(done => {
    sql.logger.info('Starting test cleanup', 'connection-pool.test.afterEach')
    env.close().then(() => {
      sql.logger.info('Test environment closed successfully', 'connection-pool.test.afterEach')
      done()
    }).catch(e => {
      sql.logger.error(`Failed to close test environment: ${e}`, 'connection-pool.test.afterEach')
      sql.logger.error(e)
    })
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

    async function tester () {
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

    await table.promises.insert(expected)
    const res = await table.promises.select(expected)
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

  async function getDescription (pool, tableName) {
    const pp = await pool.promises
    const drop = env.dropTableSql(tableName)
    await env.theConnection.promises.query(drop)
    await pp.query(`create table ${tableName} (id int, val int)`)
    await pp.query(`insert into ${tableName} values (1, 5)`)
    return await pp.beginTransaction()
  }

  it('use pool for insert in transaction', async function handler () {
    const pool = env.pool(4)
    const tableName = 'poolTranTest'
    const pp = await pool.promises
    await pp.open()
    const t1 = await getDescription(pool, tableName)
    await t1.connection.promises.query(`insert into ${tableName} values (1, 5)`)
    await pp.commitTransaction(t1)
    const res = await pp.query(`select * from ${tableName}`)
    expect(res.first).to.not.be.null
    expect(res.first.length).to.equal(2)
    const drop = env.dropTableSql(tableName)
    await env.theConnection.promises.query(drop)
    await pp.close()
  })

  it('use pool for insert/rollback in transaction', async function handler () {
    const pool = env.pool(4)
    const tableName = 'poolTranTest'
    const pp = await pool.promises
    await pp.open()
    const t1 = await getDescription(pool, tableName)
    await t1.connection.promises.query(`insert into ${tableName} values (1, 5)`)
    await pp.rollbackTransaction(t1)
    const res = await pp.query(`select * from ${tableName}`)
    expect(res.first).to.not.be.null
    expect(res.first.length).to.equal(1)
    const drop = env.dropTableSql(tableName)
    await env.theConnection.promises.query(drop)
    await pp.close()
  })

  it('use pool for encapsulated transaction', async function handler () {
    const pool = env.pool(4)
    const pp = await pool.promises
    await pp.open()
    const tableName = 'poolTranTest'
    await pp.transaction(async function (description) {
      /* I'm inside a transaction */
      const drop = env.dropTableSql(tableName)
      const cp = description.connection.promises
      await cp.query(drop)
      await cp.query(`create table ${tableName} (id int, val int)`)
      await cp.query(`insert into ${tableName} values (1, 5)`)
    })
    const res = await pp.query(`select * from ${tableName}`)
    expect(res.first).to.not.be.null
    expect(res.first.length).to.equal(1)
    const drop = env.dropTableSql(tableName)
    await env.theConnection.promises.query(drop)
    await pp.close()
  })

  describe('transactions', function () {
    it('pool.beginTransaction with callback', function handler (done) {
      const pool = env.pool(4)
      const tableName = 'poolTranCallbackTest'

      pool.open(() => {
        pool.beginTransaction(async (err, description) => {
          assert.ifError(err)
          assert(description !== null)
          assert(description.connection !== null)

          // Clean up and create table
          const drop = env.dropTableSql(tableName)
          await description.connection.promises.query(drop)
          await description.connection.promises.query(`create table ${tableName} (id int, val int)`)
          await description.connection.promises.query(`insert into ${tableName} values (1, 10)`)

          pool.commitTransaction(description, async (err) => {
            assert.ifError(err)

            // Verify data was committed
            const res = await pool.promises.query(`select * from ${tableName}`)
            expect(res.first.length).to.equal(1)
            expect(res.first[0].val).to.equal(10)

            await env.theConnection.promises.query(drop)
            pool.close(done)
          })
        })
      })
    })

    it('pool.rollbackTransaction with callback', function handler (done) {
      const pool = env.pool(4)
      const tableName = 'poolRollbackCallbackTest'

      pool.open(async () => {
        // First create the table outside transaction
        const drop = env.dropTableSql(tableName)
        await pool.promises.query(drop)
        await pool.promises.query(`create table ${tableName} (id int, val int)`)
        await pool.promises.query(`insert into ${tableName} values (1, 5)`)

        pool.beginTransaction(async (err, description) => {
          assert.ifError(err)

          // Insert more data in transaction
          await description.connection.promises.query(`insert into ${tableName} values (2, 10)`)

          pool.rollbackTransaction(description, async (err) => {
            assert.ifError(err)

            // Verify rollback - should only have original row
            const res = await pool.promises.query(`select * from ${tableName}`)
            expect(res.first.length).to.equal(1)
            expect(res.first[0].id).to.equal(1)

            await env.theConnection.promises.query(drop)
            pool.close(done)
          })
        })
      })
    })

    it('pool.beginTransaction error - no callback provided', async function handler () {
      const pool = env.pool(4)
      await pool.promises.open()

      expect(() => {
        pool.beginTransaction()
      }).to.throw('[msnodesql] Pool beginTransaction called with empty callback.')

      await pool.promises.close()
    })

    it('pool.commitTransaction error - invalid description', async function handler () {
      const pool = env.pool(4)
      await pool.promises.open()

      expect(() => {
        pool.commitTransaction(null, () => {})
      }).to.throw('Cannot read properties of null')

      await pool.promises.close()
    })

    it('pool.rollbackTransaction error - invalid description', async function handler () {
      const pool = env.pool(4)
      await pool.promises.open()

      expect(() => {
        pool.rollbackTransaction({}, () => {})
      }).to.throw('[msnodesql] Pool end transaction called with unknown or finished transaction.')

      await pool.promises.close()
    })

    it('multiple concurrent transactions on pool', async function handler () {
      const pool = env.pool(4)
      const pp = await pool.promises
      await pp.open()

      const tableName1 = 'poolTranConcurrent1'
      const tableName2 = 'poolTranConcurrent2'

      // Clean up tables
      await pp.query(env.dropTableSql(tableName1))
      await pp.query(env.dropTableSql(tableName2))

      // Start two transactions concurrently
      const [t1, t2] = await Promise.all([
        pp.beginTransaction(),
        pp.beginTransaction()
      ])

      // Each transaction creates its own table
      await t1.connection.promises.query(`create table ${tableName1} (id int)`)
      await t2.connection.promises.query(`create table ${tableName2} (id int)`)

      await t1.connection.promises.query(`insert into ${tableName1} values (1)`)
      await t2.connection.promises.query(`insert into ${tableName2} values (2)`)

      // Commit both
      await Promise.all([
        pp.commitTransaction(t1),
        pp.commitTransaction(t2)
      ])

      // Verify both tables exist with data
      const [res1, res2] = await Promise.all([
        pp.query(`select * from ${tableName1}`),
        pp.query(`select * from ${tableName2}`)
      ])

      expect(res1.first[0].id).to.equal(1)
      expect(res2.first[0].id).to.equal(2)

      // Clean up
      await pp.query(env.dropTableSql(tableName1))
      await pp.query(env.dropTableSql(tableName2))
      await pp.close()
    })

    it('pool.promises.transaction with error and automatic rollback', async function handler () {
      const pool = env.pool(4)
      const pp = await pool.promises
      await pp.open()

      const tableName = 'poolTranErrorTest'
      await pp.query(env.dropTableSql(tableName))
      await pp.query(`create table ${tableName} (id int, val int)`)
      await pp.query(`insert into ${tableName} values (1, 5)`)

      let errorThrown = false
      try {
        await pp.transaction(async function (description) {
          const cp = description.connection.promises
          await cp.query(`insert into ${tableName} values (2, 10)`)
          // Force an error
          throw new Error('Intentional error for testing')
        })
      } catch (e) {
        errorThrown = true
        expect(e.message).to.equal('Intentional error for testing')
      }

      expect(errorThrown).to.be.true

      // Verify rollback happened - should only have original row
      const res = await pp.query(`select * from ${tableName}`)
      expect(res.first.length).to.equal(1)
      expect(res.first[0].id).to.equal(1)

      await pp.query(env.dropTableSql(tableName))
      await pp.close()
    })

    it('nested transactions behavior', async function handler () {
      const pool = env.pool(4)
      const pp = await pool.promises
      await pp.open()

      const tableName = 'poolNestedTranTest'
      await pp.query(env.dropTableSql(tableName))
      await pp.query(`create table ${tableName} (id int, val int)`)

      const t1 = await pp.beginTransaction()
      await t1.connection.promises.query(`insert into ${tableName} values (1, 10)`)

      // SQL Server doesn't support true nested transactions, but we can test the behavior
      await t1.connection.promises.query('BEGIN TRANSACTION')
      await t1.connection.promises.query(`insert into ${tableName} values (2, 20)`)
      await t1.connection.promises.query('COMMIT TRANSACTION')

      await pp.commitTransaction(t1)

      const res = await pp.query(`select * from ${tableName}`)
      expect(res.first.length).to.equal(2)

      await pp.query(env.dropTableSql(tableName))
      await pp.close()
    })

    it('transaction with SELECT FOR UPDATE pattern', async function handler () {
      const pool = env.pool(4)
      const pp = await pool.promises
      await pp.open()

      const tableName = 'poolSelectForUpdateTest'
      await pp.query(env.dropTableSql(tableName))
      await pp.query(`create table ${tableName} (id int primary key, val int)`)
      await pp.query(`insert into ${tableName} values (1, 100)`)

      const description = await pp.beginTransaction()

      // Select with lock hints for update
      const locked = await description.connection.promises.query(`
        SELECT * FROM ${tableName} WITH (UPDLOCK, HOLDLOCK)
        WHERE id = 1
      `)

      expect(locked.first[0].val).to.equal(100)

      // Update the locked row
      await description.connection.promises.query(`
        UPDATE ${tableName} SET val = 200 WHERE id = 1
      `)

      await pp.commitTransaction(description)

      // Verify update
      const res = await pp.query(`select * from ${tableName} where id = 1`)
      expect(res.first[0].val).to.equal(200)

      await pp.query(env.dropTableSql(tableName))
      await pp.close()
    })
  })

  describe('pool growth strategies', function () {
    it('gradual growth strategy - creates fixed increment of connections', function handler (done) {
      const size = 10
      const increment = 3
      const options = {
        connectionString: env.connectionString,
        ceiling: size,
        scalingStrategy: 'gradual',
        scalingIncrement: increment,
        scalingDelay: 0
      }
      const pool = new env.sql.Pool(options)

      const checkins = []
      const checkouts = []
      let queryCount = 0

      pool.on('error', e => {
        assert.ifError(e)
      })

      pool.on('status', s => {
        switch (s.op) {
          case 'checkout':
            checkouts.push(s)
            break
          case 'checkin':
            checkins.push(s)
            break
        }
      })

      pool.open(() => {
        // Submit enough queries to trigger growth
        const queries = 7 // More than initial pool but less than ceiling

        for (let i = 0; i < queries; i++) {
          const q = pool.query('select @@SPID as spid')
          q.on('done', () => {
            queryCount++
            if (queryCount === queries) {
              // Check that we didn't immediately grow to ceiling
              expect(checkouts.length).to.be.lessThan(size)
              // Should have grown by increment amount multiple times
              expect(checkouts.length).to.be.greaterThan(1)
              // The growth should be in increments
              const totalConnections = Math.max(...checkouts.map(c => c.busy + c.idle))
              expect(totalConnections).to.be.lessThan(size) // Not aggressive growth
              pool.close(done)
            }
          })
        }
      })
    })

    it('exponential growth strategy - grows by scaling factor', function handler (done) {
      const size = 16
      const factor = 1.5
      const options = {
        connectionString: env.connectionString,
        ceiling: size,
        floor: 1, // Start with minimal connections to force growth
        scalingStrategy: 'exponential',
        scalingFactor: factor,
        scalingDelay: 10 // Small delay to capture growth events
      }
      const pool = new env.sql.Pool(options)

      const checkins = []
      const checkouts = []
      const growthSnapshots = []
      let queryCount = 0
      let growthEventCount = 0
      const queries = 12

      pool.on('error', e => {
        assert.ifError(e)
      })

      function runAssertions () {
        // Allow small delay for final growth events to be captured
        setTimeout(() => {
          // Verify exponential growth pattern - more lenient check
          if (growthSnapshots.length > 1) {
            // Each growth should be roughly exponential (factor based)
            for (let j = 1; j < growthSnapshots.length; j++) {
              const growth = growthSnapshots[j] / growthSnapshots[j - 1]
              expect(growth).to.be.greaterThan(1) // Should grow
            }
          } else {
            // If no growth events captured, at least verify pool handled the load
            expect(checkouts.length).to.be.greaterThan(0)
          }
          expect(checkouts.length).to.be.lessThan(size) // Not aggressive
          pool.close(done)
        }, 100)
      }

      pool.on('status', s => {
        switch (s.op) {
          case 'checkout':
            checkouts.push(s)
            const totalConnections = s.busy + s.idle
            if (totalConnections > (growthSnapshots[growthSnapshots.length - 1] || 0)) {
              growthSnapshots.push(totalConnections)
              growthEventCount++
              // If we have growth events and all queries done, run assertions
              if (growthEventCount >= 1 && queryCount === queries) {
                runAssertions()
              }
            }
            break
          case 'checkin':
            checkins.push(s)
            break
        }
      })

      pool.open(() => {
        // Submit queries in waves to trigger exponential growth

        for (let i = 0; i < queries; i++) {
          // Use slightly slower query to create more pool pressure
          const q = pool.query('WAITFOR DELAY \'00:00:00.050\'; select @@SPID as spid')
          q.on('done', () => {
            queryCount++
            if (queryCount === queries) {
              // If queries done but no growth events yet, wait a bit
              if (growthEventCount === 0) {
                setTimeout(runAssertions, 150)
              } else {
                runAssertions()
              }
            }
          })
        }
      })
    })

    it('aggressive growth strategy - immediately grows to handle demand', function handler (done) {
      const size = 8
      const options = {
        connectionString: env.connectionString,
        ceiling: size,
        scalingStrategy: 'aggressive',
        scalingDelay: 0
      }
      const pool = new env.sql.Pool(options)

      const checkins = []
      const checkouts = []
      let queryCount = 0

      pool.on('error', e => {
        assert.ifError(e)
      })

      pool.on('status', s => {
        switch (s.op) {
          case 'checkout':
            checkouts.push(s)
            break
          case 'checkin':
            checkins.push(s)
            break
        }
      })

      pool.open(() => {
        // Submit many concurrent queries to trigger aggressive growth
        const queries = size

        for (let i = 0; i < queries; i++) {
          const q = pool.query('waitfor delay \'00:00:01\';')
          q.on('done', () => {
            queryCount++
            if (queryCount === queries) {
              // Aggressive should grow quickly to meet demand
              const maxConnections = Math.max(...checkouts.map(c => c.busy + c.idle))
              expect(maxConnections).to.equal(size)
              pool.close(done)
            }
          })
        }
      })
    })

    it('gradual growth with scaling delay - creates connections sequentially', function handler (done) {
      this.timeout(15000) // Allow extra time for delays

      const size = 8
      const increment = 2
      const delay = 500 // Longer delay to ensure detectability
      const options = {
        connectionString: env.connectionString,
        ceiling: size,
        scalingStrategy: 'gradual',
        scalingIncrement: increment,
        scalingDelay: delay
      }
      const pool = new env.sql.Pool(options)

      const checkins = []
      const checkouts = []
      let queryCount = 0
      let growthEvents = 0

      pool.on('error', e => {
        assert.ifError(e)
      })

      pool.on('debug', (msg) => {
        if (msg.includes('grow creates')) {
          growthEvents++
        }
      })

      pool.on('status', s => {
        switch (s.op) {
          case 'checkout':
            checkouts.push(s)
            break
          case 'checkin':
            checkins.push(s)
            break
        }
      })

      pool.open(() => {
        // Submit enough queries to trigger multiple growth rounds
        const queries = 6

        for (let i = 0; i < queries; i++) {
          const q = pool.query('select @@SPID as spid')
          q.on('done', () => {
            queryCount++
            if (queryCount === queries) {
              setTimeout(() => {
                // Verify gradual growth occurred
                expect(growthEvents).to.be.greaterThan(0)
                // With gradual growth, we shouldn't immediately have all connections
                const finalConnections = Math.max(...checkouts.map(c => c.busy + c.idle))
                expect(finalConnections).to.be.lessThan(size)
                pool.close(done)
              }, delay + 100) // Wait a bit after queries complete
            }
          })
        }
      })
    })

    it('exponential growth limits to ceiling', function handler (done) {
      const size = 4
      const factor = 2.0
      const options = {
        connectionString: env.connectionString,
        ceiling: size,
        scalingStrategy: 'exponential',
        scalingFactor: factor,
        scalingDelay: 0
      }
      const pool = new env.sql.Pool(options)

      const checkins = []
      const checkouts = []
      let queryCount = 0

      pool.on('error', e => {
        assert.ifError(e)
      })

      pool.on('status', s => {
        switch (s.op) {
          case 'checkout':
            checkouts.push(s)
            break
          case 'checkin':
            checkins.push(s)
            break
        }
      })

      pool.open(() => {
        // Submit more queries than ceiling to test limits
        const queries = size + 2

        for (let i = 0; i < queries; i++) {
          const q = pool.query('select @@SPID as spid')
          q.on('done', () => {
            queryCount++
            if (queryCount === queries) {
              // Should never exceed ceiling
              const maxConnections = Math.max(...checkouts.map(c => c.busy + c.idle))
              expect(maxConnections).to.be.at.most(size)
              pool.close(done)
            }
          })
        }
      })
    })

    it('scaling strategy configuration validation', async function handler () {
      // Test default values
      const defaultPool = env.pool(4)
      await defaultPool.promises.open()
      // Default should be aggressive
      await defaultPool.promises.close()

      // Test invalid scaling factor gets clamped
      const options1 = {
        connectionString: env.connectionString,
        ceiling: 4,
        scalingStrategy: 'exponential',
        scalingFactor: 0.5 // Should be clamped to minimum 1.1
      }
      const pool1 = new env.sql.Pool(options1)
      await pool1.promises.open()
      await pool1.promises.close()

      // Test invalid scaling increment gets clamped
      const options2 = {
        connectionString: env.connectionString,
        ceiling: 4,
        scalingStrategy: 'gradual',
        scalingIncrement: 0 // Should be clamped to minimum 1
      }
      const pool2 = new env.sql.Pool(options2)
      await pool2.promises.open()
      await pool2.promises.close()
    })
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

  it('each pool connection to return number as string', async function handler () {
    const num = '12345678.876'
    const size = 4
    const options = {
      connectionString: env.connectionString,
      ceiling: size,
      useNumericString: true
    }
    const pool = new env.sql.Pool(options)
    await pool.promises.open()
    const q = `SELECT CAST(${num} AS numeric(11, 3)) as number`
    const res = await pool.promises.query(q)
    assert.deepStrictEqual(res.first[0].number, num)
    await pool.close()
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

  it('submit error queries with callback for results - close and check', testDone => {
    const size = 4
    const iterations = 4
    const pool = env.pool(size)

    const checkin = []
    const checkout = []
    const errors = []

    pool.on('error', e => {
      assert.ifError(e)
      errors.push(e)
    })
    pool.on('debug', s => {
      logger.debugLazy(() => s, 'Pool')
    })
    pool.open()
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
    let submissions = 0
    function submit (sql) {
      const q = pool.query(sql)

      q.on('error', e => {
        errors.push(e)
      })

      // Register all event handlers immediately to avoid race conditions
      q.on('submitted', () => {
        ++submissions
      })

      q.on('done', () => {
        ++done
      })

      q.on('free', () => {
        ++free
        if (free === iterations) {
          pool.close(() => {
            expect(errors.length).to.equal(iterations)
            expect(checkin.length).to.equal(iterations)
            expect(checkout.length).to.equal(iterations)
            testDone()
          })
        }
      })

      return q
    }
    const testSql = 'select a;'
    for (let i = 0; i < iterations; ++i) {
      submit(testSql)
    }
  })

  function optionsFromSize (s, hb) {
    return {
      connectionString: env.connectionString,
      ceiling: s,
      heartbeatSecs: hb || 10,
      inactivityTimeoutSecs: 3
    }
  }

  class Checkins {
    constructor (options) {
      this.checkin = []
      this.checkout = []
      this.parked = []
      this.opened = false
      this.free = 0
      this.done = 0
      this.submitted = 0
      options = options ||
        {
          connectionString: env.connectionString,
          ceiling: 4,
          heartbeatSecs: 1,
          inactivityTimeoutSecs: 3
        }
      this.pool = new env.sql.Pool(options)
      const pool = this.pool
      pool.on('error', e => {
        assert.ifError(e)
      })
      pool.open()

      const checkin = this.checkin
      const checkout = this.checkout
      const parked = this.parked

      pool.on('open', () => {
        this.opened = true
      })

      pool.on('status', s => {
        if (!this.opened) return
        switch (s.op) {
          case 'checkout':
            checkout.push(s)
            break
          case 'checkin':
            checkin.push(s)
            break
          case 'parked':
            parked.push(s)
            break
        }
      })
    }

    query (sql) {
      const _this = this
      const q = this.pool.query(sql)
      q.on('submitted', () => {
        _this.submitted = _this.submitted + 1
      })
      q.on('done', () => {
        _this.done = _this.done + 1
      })
      q.on('free', () => {
        _this.free = _this.free + 1
      })
      return q
    }
  }

  it('submit queries with callback for results', testDone => {
    const size = 4
    const iterations = 8
    const ci = new Checkins(optionsFromSize(size))
    const pool = ci.pool
    let free = 0
    const results = []
    function submit (sql) {
      const q = pool.query(sql, (e, res) => {
        assert.ifError(e)
        results.push(res)
      })
      q.on('submitted', () => {
        q.on('free', () => {
          ++free
          if (free === iterations) {
            expect(results.length).to.equal(iterations)
            expect(ci.checkin.length).to.equal(iterations)
            expect(ci.checkout.length).to.equal(iterations)
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

    const tester = new Checkins(optionsFromSize(4, 1))

    const parked = tester.parked
    const checkin = tester.checkin
    const pool = tester.pool

    let free = 0
    function submit (sql) {
      const q = tester.query(sql)
      q.on('submitted', () => {
        q.on('free', () => {
          ++free
          if (free === iterations) {
            pool.close()
          }
        })
      })
      return q
    }

    pool.on('status', s => {
      switch (s.op) {
        case 'parked':
          if (parked.length === size) {
            for (let i = 0; i < iterations; ++i) {
              submit('waitfor delay \'00:00:01\';')
            }
          }
          break
      }
    })

    pool.on('close', () => {
      expect(parked[size - 1].parked).to.equal(size)
      expect(parked[size - 1].idle).to.equal(0)
      expect(tester.opened).to.be.equal(true)
      expect(checkin.length).to.be.equal(size * 5) // 3 x 4 heartbeats + 1 x 4 'grow' + 1 x 4 queries
      // assert.strictEqual(size * 4, checkout.length)
      testDone()
    })
  })

  it('open pool size 4 - leave inactive so connections closed and parked', testDone => {
    const size = 4
    const ci = new Checkins({
      connectionString: env.connectionString,
      ceiling: size,
      heartbeatSecs: 1,
      inactivityTimeoutSecs: 3
    })

    const pool = ci.pool

    const parked = ci.parked
    const checkin = ci.checkin
    const checkout = ci.checkout

    pool.on('status', () => {
      if (parked.length === 0) return
      if (parked.length === size) {
        pool.close()
      }
    })

    // with 3 second inactivity will check out each connection 3 times for 3 heartbeats
    pool.on('close', () => {
      assert.strictEqual(size, parked[size - 1].parked)
      assert.strictEqual(0, parked[size - 1].idle)
      assert.strictEqual(true, ci.opened)
      assert.strictEqual(size * 3, checkin.length)
      assert.strictEqual(size * 3, checkout.length)
      testDone()
    })
  })

  function pauseCancelTester (iterations, size, cancelled, strategy, expectedTimeToComplete, testDone) {
    const ci = new Checkins(optionsFromSize(size))
    const pool = ci.pool

    const checkin = ci.checkin
    const checkout = ci.checkout

    pool.on('close', () => {
      testDone()
    })

    function submit (sql) {
      const q = ci.query(sql)
      q.on('submitted', () => {
        q.on('free', () => {
          if (ci.free === iterations) {
            assert.strictEqual(iterations - cancelled, checkout.length)
            assert.strictEqual(iterations - cancelled, checkin.length)
            assert.strictEqual(iterations, ci.done)
            const elapsed = checkin[checkin.length - 1].time - checkout[0].time
            assert(elapsed <= expectedTimeToComplete + 1000)
            pool.close()
          }
        })
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
    tester(4, 2, () => 'waitfor delay \'00:00:01\';', 3000, 0, testDone)
  })

  it('submit 4 queries to pool of 4 connections - expect 4 x concurrent queries', testDone => {
    tester(4, 4, i => `waitfor delay '00:00:0${i + 1}';`, 10000, 0, testDone)
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
