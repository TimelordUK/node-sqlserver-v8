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
const { configureTestLogging } = require('./common/logging-helper')

// Configure logging based on environment variables
// By default, tests run silently. To enable logging:
// - MSNODESQLV8_TEST_VERBOSE=true npm test  (for full trace logging)
// - MSNODESQLV8_TEST_LOG_LEVEL=DEBUG MSNODESQLV8_TEST_LOG_CONSOLE=true npm test
// - MSNODESQLV8_TEST_LOG_LEVEL=INFO MSNODESQLV8_TEST_LOG_FILE=/tmp/test.log npm test
configureTestLogging(sql)
// sql.logger.configureForTesting()

describe('querytimeout', function () {
  this.timeout(30000)

  this.beforeEach(async function () {
    sql.logger.info('Starting test setup', 'params.test.beforeEach')
    await env.open()
    sql.logger.info('Test environment opened successfully', 'params.test.beforeEach')
  })

  this.afterEach(async function () {
    sql.logger.info('Starting test cleanup', 'params.test.afterEach')
    await env.close()
    sql.logger.info('Test environment closed successfully', 'params.test.afterEach')
  })

  const waitProcDef = `alter PROCEDURE <name> (
    @timeout datetime
    )AS
    BEGIN
      SET NOCOUNT ON;
      SET XACT_ABORT ON;
      WAITFOR DELAY @timeout;
    END
    `

  it('connection: sproc with timeout early terminates', async function handler () {
    const spName = 'timeoutTest'
    const promises = env.theConnection.promises
    await env.promisedCreate(spName, waitProcDef)
    try {
      await promises.callProc(spName, {
        timeout: '00:10:00'
      }, { timeoutMs: 2000 })
      throw new Error('expected exception')
    } catch (err) {
      assert(err)
      assert(err.message.includes('Query cancelled') || err.message.includes('timeout') || err.message.includes('Operation canceled'))
    }
  })

  it('connection: sproc with timeout early terminates - check connection', async function handler () {
    const spName = 'timeoutTest'
    const promises = env.theConnection.promises
    await env.promisedCreate(spName, waitProcDef)
    try {
      await promises.callProc(spName, {
        timeout: '00:10:00'
      }, { timeoutMs: 2000 })
      throw new Error('expected exception')
    } catch (err) {
      assert(err)
      assert(err.message.includes('Query cancelled') || err.message.includes('timeout') || err.message.includes('Operation canceled'))
      const res = await promises.query('select 1 as n')
      expect(res.first[0].n).equals(1)
    }
  })

  it('pool: sproc that completes with timeout - check pool', async function handler () {
    const spName = 'timeoutTest'
    const size = 4
    const pool = env.pool(size)
    const promises = pool.promises
    await pool.promises.open()
    await env.promisedCreate(spName, waitProcDef)
    await promises.callProc(spName, {
      timeout: '00:00:01'
    }, { timeoutMs: 5000 })
    const res2 = await promises.query('select 1 as n')
    expect(res2.first[0].n).equals(1)
    await pool.close()
  })

  it('pool: sproc with timeout early terminates - check pool', async function handler () {
    const spName = 'timeoutTest'
    const size = 4
    const pool = env.pool(size)
    const promises = pool.promises
    await promises.open()
    await env.promisedCreate(spName, waitProcDef)
    try {
      await promises.callProc(spName, {
        timeout: '00:10:00'
      }, { timeoutMs: 2000 })
      throw new Error('expected exception')
    } catch (err) {
      assert(err)
      assert(err.message.includes('Query cancelled') || err.message.includes('timeout') || err.message.includes('Operation canceled'))
      const res = await promises.query('select 1 as n')
      expect(res.first[0].n).equals(1)
    } finally {
      await pool.close()
    }
  })

  it('test timeout 2 secs on waitfor delay 10', testDone => {
    const queryObj = {
      query_str: 'waitfor delay \'00:00:10\';',
      query_timeout: 2
    }

    env.theConnection.query(queryObj, err => {
      assert(err)
      // Accept either the driver's "Operation canceled" or our "Query timeout expired" message
      assert(err.message.indexOf('Operation canceled') >= 0 || err.message.indexOf('Query timeout expired') >= 0)
      testDone()
    })
  })

  it('test timeout 10 secs on waitfor delay 2', testDone => {
    const queryObj = {
      query_str: 'waitfor delay \'00:00:2\';',
      query_timeout: 10
    }

    env.theConnection.query(queryObj, err => {
      assert.ifError(err)
      testDone()
    })
  })

  it('test timeout 0 secs on waitfor delay 4', testDone => {
    const queryObj = {
      query_str: 'waitfor delay \'00:00:4\';'
    }

    env.theConnection.query(queryObj, err => {
      assert.ifError(err)
      testDone()
    })
  })

  const name = 'long_sp'
  const def = {
    name,
    def: `create PROCEDURE ${name} (
@timeout datetime
)AS
BEGIN
  select top 100 * from sysobjects;
  waitfor delay @timeout;
  select top 100 * from syscolumns;
END
`
  }

  // these three used to return their error rather than throw it, so they could not fail
  async function expectTimeout (call) {
    const ph = env.procTest(def)
    await ph.create()
    const startedAt = Date.now()
    let err = null
    try {
      await call({ timeout: '0:0:05' }, { timeoutMs: 1000 })
    } catch (e) {
      err = e
    }
    assert(err, 'expected the call to time out')
    assert(err.message.includes('timeout') || err.message.includes('Operation canceled'), err.message)
    assert(Date.now() - startedAt < 4000, 'proc was not cancelled by the timeout')
    const res = await env.theConnection.promises.query('select 1 as n')
    expect(res.first[0].n).equals(1)
  }

  it('call long running proc with timeout aggregator', async function handler () {
    await expectTimeout((p, o) => env.theConnection.callprocAggregator(def.name, p, o))
  })

  it('call long running proc with timeout', async function handler () {
    await expectTimeout((p, o) => env.theConnection.promises.callProc(def.name, p, o))
  })

  it('call long running proc with timeout - complete in time', async function handler () {
    const ph = env.procTest(def)
    await ph.create()
    const res = await env.theConnection.promises.callProc(def.name, { timeout: '0:0:01' }, {
      timeoutMs: 30000
    })
    assert(res !== null)
    assert.deepStrictEqual(res.results.length, 2)
  })
})

// issue #468 - open() against an unreachable server must call back rather than
// hang; needs no server, so it sits outside the querytimeout db setup
describe('login timeout', function () {
  const unreachable = `Driver={${env.driver}};Server=tcp:127.0.0.1,1;Trusted_Connection=Yes;`

  function openWithin (connectObj, limitMs) {
    const start = Date.now()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no callback within ${limitMs} ms`)), limitMs)
      sql.open(connectObj, (err, conn) => {
        clearTimeout(timer)
        if (conn) conn.close(() => {})
        resolve({ err, elapsed: Date.now() - start })
      })
    })
  }

  it('conn_timeout is honoured when server unreachable', async function handler () {
    this.timeout(20000)
    const { err, elapsed } = await openWithin({ conn_str: unreachable, conn_timeout: 2 }, 15000)
    assert(err, 'expected open to fail')
    expect(elapsed).to.be.lessThan(15000)
  })

  it('no conn_timeout falls back to driver default rather than hanging', async function handler () {
    this.timeout(45000)
    const { err } = await openWithin(unreachable, 40000)
    assert(err, 'expected open to fail')
  })
})
