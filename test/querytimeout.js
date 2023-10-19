'use strict'

/* globals describe it */

const { TestEnv } = require('./env/test-env')
const env = new TestEnv()
const chai = require('chai')
const assert = chai.assert
const expect = chai.expect

describe('querytimeout', function () {
  this.timeout(30000)

  this.beforeEach(done => {
    env.open().then(() => { done() })
  })

  this.afterEach(done => {
    env.close().then(() => { done() })
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
      assert(err.message.includes('Query cancelled'))
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
      assert(err.message.includes('Query cancelled'))
      const res = await promises.query('select 1 as n')
      expect(res.first[0].n).equals(1)
    }
  })

  /*
      const size = 4
    const pool = env.pool(size)
    await pool.promises.open()
    pool.on('error', e => {
      throw e
    })
  */

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
      assert(err.message.includes('Query cancelled'))
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
      assert(err.message.indexOf('Query timeout expired') > 0)
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

  it('call long running proc with timeout aggregator', async function handler () {
    try {
      const ph = env.procTest(def)
      await ph.create()
      const p = {
        timeout: '0:0:02'
      }
      const res = await env.theConnection.callprocAggregator(def.name, p, {
        timeoutMs: 1000
      })
      return new Error(`res = ${JSON.stringify(res, null, 4)}`)
    } catch (e) {
      if (e.message.indexOf('timeout') >= 0) {
        return null
      } else {
        return e
      }
    }
  })

  it('call long running proc with timeout', async function handler () {
    try {
      const ph = env.procTest(def)
      await ph.create()
      const p = {
        timeout: '0:0:02'
      }
      const res = await env.theConnection.promises.callProc(def.name, p, {
        timeoutMs: 1000
      })
      return new Error(`res = ${JSON.stringify(res, null, 4)}`)
    } catch (e) {
      if (e.message.indexOf('timeout') >= 0) {
        return null
      } else {
        return e
      }
    }
  })

  it('call long running proc with timeout - complete in time', async function handler () {
    try {
      const ph = env.procTest(def)
      await ph.create()
      const p = {
        timeout: '0:0:01'
      }
      const res = await env.theConnection.promises.callProc(def.name, p, {
        timeoutMs: 30000
      })
      assert(res !== null)
      assert.deepStrictEqual(res.results.length, 2)
    } catch (e) {
      return e
    }
  })
})
