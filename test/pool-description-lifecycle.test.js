// Regression tests for issue #317 - "Cannot read properties of null (reading 'query')"
//
// A heartbeat statement that fails during dispatch raises BOTH 'error' and 'done'
// (see lib/reader.js - the dispatch catch emits error, then done, then free). The pool
// used to act on both: 'error' triggered recreate() -> checkin, and 'done' triggered a
// second checkin of the *same* PoolDescription. The description then appeared twice in
// the idle list, and park() nulled its connection through one reference while the
// duplicate was still live - so the next heartbeat/query dereferenced a null connection.
//
// These tests stub the driver so the sequence is deterministic and no server is needed.
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { EventEmitter } = require('events')
const chai = require('chai')
const assert = chai.assert
const client = require('../lib/sql-client').sqlCLientModule
const { poolModule } = require('../lib/pool')

/* globals describe it beforeEach afterEach */

describe('pool description lifecycle (issue #317)', function () {
  this.timeout(30000)

  let originalOpen

  beforeEach(() => {
    originalOpen = client.promises.open
  })

  afterEach(() => {
    client.promises.open = originalOpen
  })

  // failHeartbeat: when set, the next heartbeat statement raises error+done+free
  function stubDriver (state) {
    let connSeq = 0
    client.promises.open = async () => {
      const id = connSeq++
      const c = {
        id,
        setSharedCache () {},
        setMaxPreparedColumnSize () {},
        setUseUTC () {},
        setUseNumericString () {},
        setUseBigIntAsNative () {},
        promises: { close: async () => {} },
        query () {
          const q = new EventEmitter()
          const bad = state.failHeartbeat
          state.failHeartbeat = false
          setImmediate(() => {
            if (bad) {
              // mirrors the reader.js dispatch error path ordering
              q.emit('error', new Error('simulated statement dispatch failure'))
              q.emit('done', null)
              q.emit('free')
            } else {
              q.emit('column', 0, 51 + id)
              q.emit('done', null)
              q.emit('free')
            }
          })
          return q
        }
      }
      c.queryRaw = c.query
      c.callproc = c.query
      return c
    }
  }

  function runPool (state, seconds, poison) {
    return new Promise((resolve, reject) => {
      const pool = new poolModule.Pool({
        connectionString: 'stub',
        floor: 0,
        ceiling: 1,
        heartbeatSecs: 1,
        inactivityTimeoutSecs: 3
      })
      const observed = { maxIdle: 0, nullConnection: false, errors: [] }

      pool.on('status', s => {
        observed.maxIdle = Math.max(observed.maxIdle, s.idle)
      })
      pool.on('error', e => observed.errors.push(e))

      const onUncaught = e => {
        observed.nullConnection = true
        observed.errors.push(e)
      }
      process.once('uncaughtException', onUncaught)

      pool.open(e => {
        if (e) {
          process.removeListener('uncaughtException', onUncaught)
          return reject(e)
        }
        if (poison) {
          setTimeout(() => { state.failHeartbeat = true }, 1000)
        }
        setTimeout(() => {
          process.removeListener('uncaughtException', onUncaught)
          pool.close(() => resolve(observed))
        }, seconds * 1000)
      })
    })
  }

  it('a heartbeat raising both error and done does not duplicate the description', async function handler () {
    const state = { failHeartbeat: false }
    stubDriver(state)
    const observed = await runPool(state, 9, true)

    assert.isFalse(observed.nullConnection,
      'pool dereferenced a null connection - issue #317 has regressed')
    // ceiling is 1, so a single description must never yield idle > 1
    assert.strictEqual(observed.maxIdle, 1,
      `idle exceeded ceiling (${observed.maxIdle}) - description was checked in twice`)
    // the simulated failure itself should still surface to the caller
    assert.isTrue(observed.errors.some(e => /simulated statement dispatch failure/.test(e.message)),
      'the heartbeat failure was swallowed')
  })

  it('closing the pool actually closes its idle connections', async function handler () {
    // close() used to map `promises.close` without invoking it, so Promise.all
    // resolved over an array of functions and the connections stayed open.
    let closeCalls = 0
    let opened = 0
    client.promises.open = async () => {
      opened++
      const c = {
        setSharedCache () {},
        setMaxPreparedColumnSize () {},
        setUseUTC () {},
        setUseNumericString () {},
        setUseBigIntAsNative () {},
        promises: { close: async () => { closeCalls++ } },
        query () {
          const q = new EventEmitter()
          setImmediate(() => {
            q.emit('column', 0, 51)
            q.emit('done', null)
            q.emit('free')
          })
          return q
        }
      }
      c.queryRaw = c.query
      c.callproc = c.query
      return c
    }

    const pool = new poolModule.Pool({
      connectionString: 'stub',
      floor: 2,
      ceiling: 2,
      heartbeatSecs: 30,
      inactivityTimeoutSecs: 30
    })

    await new Promise((resolve, reject) => pool.open(e => e ? reject(e) : resolve()))
    assert.strictEqual(opened, 2, 'expected the pool to open ceiling connections')
    assert.strictEqual(closeCalls, 0)

    await new Promise(resolve => pool.close(resolve))
    assert.strictEqual(closeCalls, 2, 'idle connections were not closed on pool shutdown')
    assert.isTrue(pool.isClosed())
  })

  it('healthy heartbeats park an idle connection without duplication', async function handler () {
    const state = { failHeartbeat: false }
    stubDriver(state)
    const observed = await runPool(state, 7, false)

    assert.isFalse(observed.nullConnection)
    assert.strictEqual(observed.maxIdle, 1)
  })
})
