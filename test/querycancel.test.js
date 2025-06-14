'use strict'

import { createRequire } from 'module'
import chaiAsPromised from 'chai-as-promised'
const require = createRequire(import.meta.url)
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()
const chai = require('chai')
chai.use(chaiAsPromised)
const assert = chai.assert

const sql = require('../lib/sql')
const { configureTestLogging } = require('./common/logging-helper')

// Configure logging based on environment variables
// By default, tests run silently. To enable logging:
// - MSNODESQLV8_TEST_VERBOSE=true npm test  (for full trace logging)
// - MSNODESQLV8_TEST_LOG_LEVEL=DEBUG MSNODESQLV8_TEST_LOG_CONSOLE=true npm test
// - MSNODESQLV8_TEST_LOG_LEVEL=INFO MSNODESQLV8_TEST_LOG_FILE=/tmp/test.log npm test
configureTestLogging(sql)
sql.logger.configureForDevelopment()

describe('querycancel', function () {
  this.timeout(30000)

  this.beforeEach(done => {
    sql.logger.info('Starting test setup', 'querycancel.test.beforeEach')
    env.open().then(() => {
      sql.logger.info('Test environment opened successfully', 'querycancel.test.beforeEach')
      done()
    }).catch(e => {
      sql.logger.error(`Failed to open test environment: ${e}`, 'querycancel.test.beforeEach')
      sql.logger.error(e)
    })
  })

  this.afterEach(done => {
    sql.logger.info('Starting test cleanup', 'querycancel.test.afterEach')
    env.close().then(() => {
      sql.logger.info('Test environment closed successfully', 'querycancel.test.afterEach')
      done()
    }).catch(e => {
      sql.logger.error(`Failed to close test environment: ${e}`, 'querycancel.test.afterEach')
      sql.logger.error(e)
    })
  })

  it('cancel a prepared call that waits refactor', testDone => {
    const s = 'waitfor delay ?;'
    let prepared
    let cancelCalled = false
    let queryCompleted = false

    env.theConnection.prepare(env.sql.PollingQuery(s), (err, pq) => {
      console.log('AppVeyor Debug: prepare callback, err=', err)
      assert(!err)
      prepared = pq

      const q = prepared.preparedQuery(['00:00:30'], err => {
        queryCompleted = true
        console.log('AppVeyor Debug: query completed, err=', err)
        console.log('AppVeyor Debug: cancelCalled=', cancelCalled)
        if (err) {
          console.log('AppVeyor Debug: error message=', err.message)
          console.log('AppVeyor Debug: error stack=', err.stack)
        } else {
          console.log('AppVeyor Debug: ERROR - query completed successfully without cancellation!')
        }
        assert(err, 'Expected query to be cancelled but it completed successfully')
        assert(err.message.indexOf('Operation canceled') > 0, `Expected "Operation canceled" but got "${err.message}"`)
        testDone()
      })

      q.on('submitted', () => {
        console.log('AppVeyor Debug: query submitted, cancelling...')
        console.log('AppVeyor Debug: q.polling =', q.polling)
        // Add a small delay to ensure the query has started executing
        setTimeout(() => {
          cancelCalled = true
          console.log('AppVeyor Debug: about to cancel query')
          q.cancelQuery(err => {
            console.log('AppVeyor Debug: cancelQuery callback, err=', err)
            if (err) {
              console.log('AppVeyor Debug: cancel error message=', err.message)
            }
            assert(!err)
          })
        }, 100)
      })
    })
  })

  it('cancel a prepared call that waits', testDone => {
    const s = 'waitfor delay ?;'
    let prepared

    const fns = [
      asyncDone => {
        env.theConnection.prepare(env.sql.PollingQuery(s), (err, pq) => {
          assert(!err)
          prepared = pq
          asyncDone()
        })
      },

      asyncDone => {
        const q = prepared.preparedQuery(['00:00:20'], err => {
          assert(err)
          assert(err.message.indexOf('Operation canceled') > 0)
          asyncDone()
        })

        q.on('submitted', () => {
          q.cancelQuery(err => {
            assert(!err)
          })
        })
      }
    ]

    env.async.series(fns, () => {
      testDone()
    })
  })

  it('use promise on query to cancel', async function handler () {
    const conn = env.theConnection
    const waitsql = env.waitForSql(20)
    const q = conn.query(waitsql)
    const err = await q.promises.cancel()
    assert(err.message.includes('Operation canceled'))
  })

  it('nested cancel - expect Operation canceled on both', testDone => {
    const q1 = env.theConnection.query(env.sql.PollingQuery(env.waitForSql(50)), err => {
      assert(err.message.indexOf('Operation canceled') > 0)
      const q2 = env.theConnection.query(env.sql.PollingQuery(env.waitForSql(40)), err => {
        assert(err.message.indexOf('Operation canceled') > 0)
        testDone()
      })

      env.theConnection.cancelQuery(q2, err => {
        assert(!err)
      })
    })

    env.theConnection.cancelQuery(q1, err => {
      assert(!err)
    })
  })

  it('cancel single waitfor using notifier - expect Operation canceled', testDone => {
    const q = env.theConnection.query(env.sql.PollingQuery(env.waitForSql(20)), err => {
      assert(err)
      assert(err.message.indexOf('Operation canceled') > 0)
      testDone()
    })

    q.cancelQuery(err => {
      assert(!err)
    })
  })

  it('cancel single query and submit new query to prove connection still valid', testDone => {
    const q = env.theConnection.query(env.sql.PollingQuery(env.waitForSql(20)), err => {
      assert(err)
      assert(err.message.indexOf('Operation canceled') > 0)
      env.theConnection.query('SELECT 1 as x', [], (err, res) => {
        assert(!err)
        assert.deepStrictEqual(res, [
          {
            x: 1
          }
        ])
        testDone()
      })
    })

    env.theConnection.cancelQuery(q, err => {
      assert(!err)
    })
  })

  it('cancel single query from notifier using tmp connection - expect Operation canceled', testDone => {
    const q = env.sql.query(env.connectionString, env.sql.PollingQuery(env.waitForSql(59)), err => {
      assert(err)
      assert(err.message.indexOf('Operation canceled') >= 0)
      testDone()
    })
    q.on('submitted', () => {
      q.cancelQuery(err => {
        assert(!err)
      })
    })
  })

  it('cancel single waitfor - expect Operation canceled', testDone => {
    const q = env.theConnection.query(env.sql.PollingQuery(env.waitForSql(20)), err => {
      assert(err)
      assert(err.message.indexOf('Operation canceled') > 0)
      testDone()
    })

    env.theConnection.cancelQuery(q, err => {
      assert(!err)
    })
  })

  it('cancel single waitfor on non polling query - expect cancel error and query to complete', testDone => {
    const q = env.theConnection.query(env.waitForSql(3), err => {
      assert(!err)
      testDone()
    })

    env.theConnection.cancelQuery(q, err => {
      assert(err)
      assert(err.message.indexOf('only supported') > 0)
    })
  })

  it('cancel single query - expect Operation canceled', testDone => {
    const q = env.theConnection.query(env.sql.PollingQuery(env.waitForSql(20)), err => {
      assert(err)
      assert(err.message.indexOf('Operation canceled') > 0)
      testDone()
    })

    env.theConnection.cancelQuery(q, err => {
      assert(!err)
    })
  })

  it('waitfor delay 20 and delayed cancel- expect Operation canceled', testDone => {
    const q = env.theConnection.query(env.sql.PollingQuery(env.waitForSql(20)), err => {
      assert(err)
      assert(err.message.indexOf('Operation canceled') > 0)
      testDone()
    })

    setTimeout(() => {
      env.theConnection.cancelQuery(q, err => {
        assert(!err)
      })
    }, 100)
  })

  it('cancel single query and cancel again - expect Operation canceled and error', testDone => {
    const q = env.theConnection.query(env.sql.PollingQuery(env.waitForSql(20)), err => {
      assert(err)
      assert(err.message.indexOf('Operation canceled') > 0)
      setImmediate(() => {
        // now try and cancel again
        env.theConnection.cancelQuery(q, err => {
          assert(err)
          assert(err.message.indexOf('cannot cancel query') > 0)
          testDone()
        })
      })
    })

    env.theConnection.cancelQuery(q, err => {
      assert(!err)
    })
  })

  it('2 x cancel - expect Operation canceled on both', testDone => {
    let hits = 0

    function hit (err) {
      assert(err)
      assert(err.message.indexOf('Operation canceled') > 0)
      hits++
      if (hits === 2) {
        testDone()
      }
    }

    const q1 = env.theConnection.query(env.sql.PollingQuery(env.waitForSql(20)), err => {
      hit(err)
    })

    const q2 = env.theConnection.query(env.sql.PollingQuery(env.waitForSql(20)), err => {
      hit(err)
    })

    env.theConnection.cancelQuery(q1, err => {
      assert(!err)
    })

    env.theConnection.cancelQuery(q2, err => {
      assert(!err)
    })
  })

  it('pause a large query and cancel check done', testDone => {
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
          })
        }, 50)
      }
    })
    q.on('done', () => {
      testDone()
    })
  })

  it.skip('cancel a call to proc that waits for delay of input param. (PENDING: Stored proc support not yet implemented)', testDone => {
    const spName = 'test_spwait_for'

    const def = 'alter PROCEDURE <name>' +
      '(\n' +
      '@timeout datetime' +
      '\n)' +
      'AS\n' +
      'BEGIN\n' +
      'waitfor delay @timeout;' +
      'END\n'

    const fns = [
      asyncDone => {
        env.procedureHelper.createProcedure(spName, def, () => {
          asyncDone()
        })
      },

      asyncDone => {
        const pm = env.theConnection.procedureMgr()
        pm.setPolling(true)
        const q = pm.callproc(spName, ['0:0:20'], err => {
          assert(err)
          assert(err.message.indexOf('Operation canceled') > 0)
          asyncDone()
        })
        q.on('submitted', () => {
          q.cancelQuery(err => {
            assert(!err)
          })
        })
      }
    ]

    env.async.series(fns, () => {
      testDone()
    })
  })
})
