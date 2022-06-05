'use strict'

/* globals describe it */

const assert = require('assert')
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()

describe('querytimeout', function () {
  this.timeout(30000)

  this.beforeEach(done => {
    env.open().then(() => done())
  })

  this.afterEach(done => {
    env.close().then(() => done())
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

  it('call long running proc with timeout aggregator', async function handler () {
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
