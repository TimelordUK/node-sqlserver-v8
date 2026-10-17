'use strict'

const sql = require('../lib/sql')
const assert = require('chai').assert
const { TestEnv } = require('./env/test-env')

/* globals describe it beforeEach afterEach */

const { configureTestLogging } = require('./common/logging-helper')

// Configure logging based on environment variables
// By default, tests run silently. To enable logging:
// - MSNODESQLV8_TEST_VERBOSE=true npm test  (for full trace logging)
// - MSNODESQLV8_TEST_LOG_LEVEL=DEBUG MSNODESQLV8_TEST_LOG_CONSOLE=true npm test
// - MSNODESQLV8_TEST_LOG_LEVEL=INFO MSNODESQLV8_TEST_LOG_FILE=/tmp/test.log npm test
configureTestLogging(sql)

describe('pause', function () {
  // Test configuration
  const TIMEOUT = 30000
  const LARGE_QUERY_ROWS = 3000
  const PAUSE_INTERVAL = 100
  const RESUME_DELAY = 50
  const PAUSE_CHECK_DELAY = 200

  // Common test queries
  const QUERIES = {
    large: `select top ${LARGE_QUERY_ROWS} * from syscolumns`,
    simple: 'select \'hello\'',
    all: 'select * from syscolumns'
  }

  // Test environment
  const env = new TestEnv()

  this.timeout(TIMEOUT)

  this.beforeEach(done => {
    sql.logger.info('Starting test setup', 'params.test.beforeEach')
    env.open().then(() => {
      sql.logger.info('Test environment opened successfully', 'params.test.beforeEach')
      done()
    }).catch(e => {
      sql.logger.error(`Failed to open test environment: ${e}`, 'params.test.beforeEach')
      sql.logger.error(e)
    })
  })

  this.afterEach(done => {
    sql.logger.info('Starting test cleanup', 'params.test.afterEach')
    env.close().then(() => {
      sql.logger.info('Test environment closed successfully', 'params.test.afterEach')
      done()
    }).catch(e => {
      sql.logger.error(`Failed to close test environment: ${e}`, 'params.test.afterEach')
      sql.logger.error(e)
    })
  })

  // Helper function to count rows from a query
  async function countQueryRows (connection, query) {
    return new Promise((resolve, reject) => {
      let count = 0
      const q = connection.query(query)
      q.on('row', () => count++)
      q.on('done', () => { resolve(count) })
      q.on('error', reject)
    })
  }

  // Helper function to create a query with row counting
  function createRowCountingQuery (connection, query, options = {}) {
    const q = connection.query(query)
    let rows = 0

    const result = {
      query: q,
      getRowCount: () => rows,
      onRow: options.onRow || (() => {}),
      // a query a test leaves paused is cancelled when the connection closes (HY008)
      onError: options.onError || ((e) => { if (e?.sqlstate !== 'HY008') assert.ifError(e) }),
      onDone: options.onDone || (() => {})
    }

    q.on('row', () => {
      rows++
      result.onRow(rows)
    })
    q.on('error', result.onError)
    q.on('done', () => result.onDone(rows))

    return result
  }

  describe('basic pause/resume functionality', () => {
    it('should pause a large query and cancel without resume', function (done) {
      // a paused query ends on cancel as any other: no more rows, an HY008 error, then free
      let cancelErr
      const queryHelper = createRowCountingQuery(env.theConnection, QUERIES.large, {
        onRow: (rowCount) => {
          assert(!cancelErr, 'no rows after a cancel')
          if (rowCount % PAUSE_INTERVAL === 0) {
            queryHelper.query.pauseQuery()
            setTimeout(() => {
              queryHelper.query.cancelQuery(e => { assert.ifError(e) })
            }, RESUME_DELAY)
          }
        },
        onError: e => { cancelErr = e }
      })
      queryHelper.query.on('free', () => {
        assert(cancelErr, 'expected an error on cancel')
        assert.strictEqual(cancelErr.sqlstate, 'HY008')
        done()
      })
    })

    it('should handle resume on a query that was never paused', async function () {
      const expectedRows = await countQueryRows(env.theConnection, QUERIES.large)

      return new Promise((resolve, reject) => {
        const queryHelper = createRowCountingQuery(env.theConnection, QUERIES.large, {
          onRow: () => {
            queryHelper.query.resumeQuery() // Resume without pause
          },
          onDone: (rowCount) => {
            try {
              assert.strictEqual(rowCount, expectedRows)
              resolve()
            } catch (e) {
              reject(e)
            }
          },
          onError: reject
        })
      })
    })

    it('should allow queries to start in paused state', function (done) {
      const q = env.theConnection.query(QUERIES.large)
      q.pauseQuery() // Pause before any rows

      let rowCount = 0
      q.on('row', () => rowCount++)
      q.on('error', (e) => { assert.ifError(e) })

      setTimeout(() => {
        assert.strictEqual(rowCount, 0, 'Should not receive any rows when starting paused')
        q.on('free', () => {
          assert(rowCount > 0, 'rows once resumed')
          done()
        })
        q.resumeQuery()
      }, PAUSE_CHECK_DELAY)
    })

    it('should pause and resume every N rows', async function () {
      const expectedRows = await countQueryRows(env.theConnection, QUERIES.large)

      return new Promise((resolve, reject) => {
        const queryHelper = createRowCountingQuery(env.theConnection, QUERIES.large, {
          onRow: (rowCount) => {
            if (rowCount % PAUSE_INTERVAL === 0) {
              queryHelper.query.pauseQuery()
              setTimeout(() => {
                queryHelper.query.resumeQuery()
              }, RESUME_DELAY)
            }
          },
          onDone: (rowCount) => {
            try {
              assert.strictEqual(rowCount, expectedRows)
              resolve()
            } catch (e) {
              reject(e)
            }
          },
          onError: reject
        })
      })
    })
  })

  describe('edge cases', () => {
    it('should handle pause on a completed query', function (done) {
      const queryHelper = createRowCountingQuery(env.theConnection, QUERIES.simple, {
        onDone: (rowCount) => {
          assert.strictEqual(rowCount, 1)
          queryHelper.query.pauseQuery() // Should not throw
          done()
        }
      })
    })

    it('should handle multiple pause calls', function (done) {
      const queryHelper = createRowCountingQuery(env.theConnection, QUERIES.simple, {
        onRow: () => {
          queryHelper.query.pauseQuery()
          queryHelper.query.pauseQuery() // Double pause
          // nothing more, not even done, until resumed - and one resume is enough
          setTimeout(() => queryHelper.query.resumeQuery(), PAUSE_CHECK_DELAY)
        },
        onDone: (rowCount) => {
          assert.strictEqual(rowCount, 1)
          done()
        }
      })
    })
  })

  describe('query interaction', () => {
    it('should hold the connection while paused - a new query waits', function (done) {
      const pauseAt = 10
      let resumed = false
      let firstFree = false
      const queryHelper = createRowCountingQuery(env.theConnection, QUERIES.large, {
        onRow: (rowCount) => {
          if (rowCount === pauseAt) {
            queryHelper.query.pauseQuery()
            const q2 = env.theConnection.query(QUERIES.large, (err, res) => {
              assert.ifError(err)
              assert(firstFree, 'the paused query finishes first')
              assert(res.length > 0)
              done()
            })
            q2.on('submitted', () => assert(resumed, 'not submitted while the first is paused'))
            setTimeout(() => {
              assert.strictEqual(queryHelper.getRowCount(), pauseAt)
              resumed = true
              queryHelper.query.resumeQuery()
            }, PAUSE_CHECK_DELAY)
          }
        }
      })
      queryHelper.query.on('free', () => { firstFree = true })
    })

    it('should allow new query after cancel', function (done) {
      const queryHelper = createRowCountingQuery(env.theConnection, QUERIES.large, {
        onRow: (rowCount) => {
          if (rowCount % PAUSE_INTERVAL === 0) {
            queryHelper.query.pauseQuery()
            setTimeout(() => {
              queryHelper.query.cancelQuery((err) => {
                assert.ifError(err)
                // Submit new query after cancel
                env.theConnection.query(QUERIES.large, (err, res) => {
                  assert.ifError(err)
                  assert(res.length > 0)
                  done()
                })
              })
            }, RESUME_DELAY)
          }
        }
      })
    })

    it('should handle pause and resume with subsequent query', async function () {
      const expectedRows = await countQueryRows(env.theConnection, QUERIES.large)

      return new Promise((resolve, reject) => {
        const queryHelper = createRowCountingQuery(env.theConnection, QUERIES.large, {
          onRow: (rowCount) => {
            if (rowCount % PAUSE_INTERVAL === 0) {
              queryHelper.query.pauseQuery()
              setTimeout(() => {
                queryHelper.query.resumeQuery()
              }, RESUME_DELAY)
            }
          },
          onDone: (rowCount) => {
            assert.strictEqual(rowCount, expectedRows)
            // Run another query after completion
            env.theConnection.query(QUERIES.large, (err, res) => {
              try {
                assert.ifError(err)
                assert.strictEqual(res.length, expectedRows)
                resolve()
              } catch (e) {
                reject(e)
              }
            })
          },
          onError: reject
        })
      })
    })
  })

  describe('connection handling', () => {
    it('should handle connection close with paused query', function (done) {
      env.sql.open(env.connectionString, (err, newConn) => {
        assert.ifError(err)

        const q = newConn.query(QUERIES.large)
        q.pauseQuery()

        let rowCount = 0
        let cancelErr
        let freed = false
        q.on('row', () => rowCount++)
        q.on('error', (e) => { cancelErr = e })
        q.on('free', () => { freed = true })

        // Wait a bit to ensure no rows are received, then close: the close cancels the
        // paused query, which ends and frees its statement before the connection closes
        setTimeout(() => {
          assert.strictEqual(rowCount, 0, 'Should not receive rows while paused')
          newConn.close((err) => {
            assert.ifError(err)
            assert.strictEqual(cancelErr?.sqlstate, 'HY008')
            assert(freed, 'the paused query is freed before the close completes')
            done()
          })
        }, PAUSE_CHECK_DELAY * 5) // Longer wait for this test
      })
    })

    it('should stop at specified row count when paused', function (done) {
      const pauseAt = 10
      const queryHelper = createRowCountingQuery(env.theConnection, QUERIES.large, {
        onRow: (rowCount) => {
          if (rowCount === pauseAt) {
            queryHelper.query.pauseQuery()
            setTimeout(() => {
              assert.strictEqual(queryHelper.getRowCount(), pauseAt)
              done()
            }, PAUSE_CHECK_DELAY)
          }
        }
      })
    })
  })

  describe('end-of-resultset pause/resume (issue #389)', () => {
    // These tests cover the scenario where pause is called near the end of a
    // result set. When the native ODBC batch is the final batch (endOfRows=true)
    // and the query is paused mid-batch, resume must not call nativeGetRows again
    // or the ODBC driver will crash (Windows: 0xC0000005) or return a function
    // sequence error (Linux).

    it('should handle pause near end of small result set', async function () {
      const totalRows = 50
      const query = `select top ${totalRows} * from syscolumns`
      const pauseAt = totalRows - 5

      return new Promise((resolve, reject) => {
        let rows = 0
        const q = env.theConnection.query(query)
        q.on('error', reject)
        q.on('row', () => {
          rows++
          if (rows === pauseAt) {
            q.pauseQuery()
            setTimeout(() => {
              q.resumeQuery()
            }, RESUME_DELAY)
          }
        })
        q.on('done', () => {
          try {
            assert.strictEqual(rows, totalRows)
            resolve()
          } catch (e) {
            reject(e)
          }
        })
      })
    })

    it('should handle repeated pause/resume cycles across page boundaries', async function () {
      const totalRows = 100
      const query = `select top ${totalRows} * from syscolumns`
      const pageSize = 10

      return new Promise((resolve, reject) => {
        let rows = 0
        const q = env.theConnection.query(query)
        q.on('error', reject)
        q.on('row', () => {
          rows++
          if (rows % pageSize === 0) {
            q.pauseQuery()
            setTimeout(() => {
              q.resumeQuery()
            }, RESUME_DELAY)
          }
        })
        q.on('done', () => {
          try {
            assert.strictEqual(rows, totalRows)
            resolve()
          } catch (e) {
            reject(e)
          }
        })
      })
    })

    it('should complete normally after pause near end then run subsequent query', async function () {
      const totalRows = 50
      const query = `select top ${totalRows} * from syscolumns`
      const pauseAt = totalRows - 5

      // First: run with pause near end
      await new Promise((resolve, reject) => {
        let rows = 0
        const q = env.theConnection.query(query)
        q.on('error', reject)
        q.on('row', () => {
          rows++
          if (rows === pauseAt) {
            q.pauseQuery()
            setTimeout(() => {
              q.resumeQuery()
            }, RESUME_DELAY)
          }
        })
        q.on('done', () => {
          try {
            assert.strictEqual(rows, totalRows)
            resolve()
          } catch (e) {
            reject(e)
          }
        })
      })

      // Second: run a normal query to verify connection is still usable
      const secondRows = await countQueryRows(env.theConnection, query)
      assert.strictEqual(secondRows, totalRows)
    })

    it('should handle multiple pause/resume near end in sequence', async function () {
      const totalRows = 50
      const query = `select top ${totalRows} * from syscolumns`

      for (let iteration = 0; iteration < 5; iteration++) {
        await new Promise((resolve, reject) => {
          let rows = 0
          const q = env.theConnection.query(query)
          q.on('error', reject)
          q.on('row', () => {
            rows++
            if (rows === totalRows - 3) {
              q.pauseQuery()
              setTimeout(() => {
                q.resumeQuery()
              }, RESUME_DELAY)
            }
          })
          q.on('done', () => {
            try {
              assert.strictEqual(rows, totalRows)
              resolve()
            } catch (e) {
              reject(e)
            }
          })
        })
      }
    })
  })

  describe('performance', () => {
    it('should handle large query without pause', function (done) {
      const q = env.theConnection.query(QUERIES.all)
      q.on('error', (e) => { assert.ifError(e) })
      q.on('row', () => {}) // Process rows
      q.on('done', done)
    })
  })
})
