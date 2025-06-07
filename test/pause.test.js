'use strict'

const sql = require('../lib/sql')
const assert = require('chai').assert
const { TestEnv } = require('./env/test-env')

/* globals describe it beforeEach afterEach */

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

  beforeEach(async function () {
    // Disable logging for tests unless debugging
    const { configureTestLogging } = require('./common/logging-helper')
    await env.open()
  })

  afterEach(async function () {
    await env.close()
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
      onError: options.onError || ((e) => { assert.ifError(e) }),
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
      const queryHelper = createRowCountingQuery(env.theConnection, QUERIES.large, {
        onRow: (rowCount) => {
          if (rowCount % PAUSE_INTERVAL === 0) {
            queryHelper.query.pauseQuery()
            setTimeout(() => {
              queryHelper.query.cancelQuery(done)
            }, RESUME_DELAY)
          }
        }
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
        done()
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
        },
        onDone: (rowCount) => {
          assert.strictEqual(rowCount, 1)
          done()
        }
      })
    })
  })

  describe('query interaction', () => {
    it('should kill paused query when new query is submitted', function (done) {
      const pauseAt = 10
      const queryHelper = createRowCountingQuery(env.theConnection, QUERIES.large, {
        onRow: (rowCount) => {
          if (rowCount === pauseAt) {
            queryHelper.query.pauseQuery()
            setTimeout(() => {
              assert.strictEqual(queryHelper.getRowCount(), pauseAt)
              // New query should kill the paused one
              env.theConnection.query(QUERIES.large, (err, res) => {
                assert.ifError(err)
                assert(Array.isArray(res))
                assert(res.length > 0)
                done()
              })
            }, PAUSE_CHECK_DELAY)
          }
        }
      })
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
        q.on('row', () => rowCount++)
        q.on('error', (e) => { assert.ifError(e) })

        // Wait a bit to ensure no rows are received, then close
        setTimeout(() => {
          assert.strictEqual(rowCount, 0, 'Should not receive rows while paused')
          newConn.close((err) => {
            assert.ifError(err)
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

  describe('performance', () => {
    it('should handle large query without pause', function (done) {
      const q = env.theConnection.query(QUERIES.all)
      q.on('error', (e) => { assert.ifError(e) })
      q.on('row', () => {}) // Process rows
      q.on('done', done)
    })
  })
})
