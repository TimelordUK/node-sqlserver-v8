'use strict'

/* globals describe it beforeEach afterEach */

const { describe, it, beforeEach, afterEach } = require('mocha')
const { assert, expect } = require('chai')
const { TestEnv } = require('./env/test-env')

describe('Connection Tests - Improved', function () {
  let env
  let connectionString

  // Increase timeout for database operations
  this.timeout(30000)

  /**
   * @beforeEach
   */
  beforeEach(async function () {
    env = new TestEnv()
    connectionString = env.connectionString
    try {
      await env.open()
    } catch (err) {
      console.error('Failed to open test environment:', err)
      throw err
    }
  })

  /**
   * @afterEach
   */
  afterEach(async function () {
    try {
      await env.close()
    } catch (err) {
      console.error('Failed to close test environment:', err)
      throw err
    }
  })

  describe('Basic Connection Operations', function () {
    /**
     * @test {Connection}
     */
    it('should open and close connection successfully', async function () {
      let conn

      try {
        // Open connection with promise
        conn = await env.sql.promises.open(connectionString)
        assert.isObject(conn, 'Connection should be an object')

        // Verify connection is open by running a simple query
        const result = await conn.promises.query('SELECT 1 as test')
        expect(result.first).to.have.lengthOf(1)
        expect(result.first[0]).to.deep.equal({ test: 1 })
      } catch (err) {
        assert.fail(`Failed to open connection or execute query: ${err.message}`)
      } finally {
        if (conn) {
          await conn.promises.close()
        }
      }
    })

    it('should handle connection open errors gracefully', async function () {
      const invalidConnectionString = 'Server=invalid;Database=invalid;'

      try {
        await env.sql.promises.open(invalidConnectionString)
        assert.fail('Should have thrown an error for invalid connection')
      } catch (err) {
        assert.isObject(err, 'Error should be an object')
        assert.property(err, 'message', 'Error should have a message')
        assert.match(err.message, /Driver/i, 'Error message should indicate connection failure')
      }
    })
  })

  describe('Query Execution', function () {
    it('should execute query with proper error handling', async function () {
      let conn

      try {
        conn = await env.sql.promises.open(connectionString)

        const result = await conn.promises.query('SELECT 1 as n, 2 as m')
        expect(result.first).to.have.lengthOf(1)
        expect(result.first[0]).to.deep.equal({ n: 1, m: 2 })
      } catch (err) {
        assert.fail(`Query execution failed: ${err.message}`)
      } finally {
        if (conn) {
          await conn.promises.close()
        }
      }
    })

    it('should handle query syntax errors properly', async function () {
      let conn

      try {
        conn = await env.sql.promises.open(connectionString)

        await conn.promises.query('INVALID SQL SYNTAX')
        assert.fail('Should have thrown an error for invalid SQL')
      } catch (err) {
        assert.property(err, 'message', 'Error should have a message')
        assert.match(err.message, /syntax|invalid/i, 'Error should indicate SQL syntax error')
      } finally {
        if (conn) {
          await conn.promises.close()
        }
      }
    })
  })

  describe('Connection State Management', function () {
    it('should throw error when using closed connection', async function () {
      let conn

      try {
        conn = await env.sql.promises.open(connectionString)
        await conn.promises.close()

        // Try to use closed connection
        await conn.promises.query('SELECT 1')
        assert.fail('Should have thrown an error for closed connection')
      } catch (err) {
        assert.match(err.message, /closed|not open/i, 'Error should indicate connection is closed')
      }
    })

    it('should handle concurrent queries on same connection', async function () {
      let conn

      try {
        conn = await env.sql.promises.open(connectionString)

        // Execute multiple queries concurrently
        const queries = [
          conn.promises.query('SELECT 1 as num'),
          conn.promises.query('SELECT 2 as num'),
          conn.promises.query('SELECT 3 as num')
        ]

        const results = await Promise.all(queries)
        const firsts = results.map(r => r.first[0])
        expect(results).to.have.lengthOf(3)
        expect(firsts[0].num).to.equal(1)
        expect(firsts[1].num).to.equal(2)
        expect(firsts[2].num).to.equal(3)
      } catch (err) {
        assert.fail(`Concurrent query execution failed: ${err.message}`)
      } finally {
        if (conn) {
          await conn.promises.close()
        }
      }
    })
  })

  describe('Callback API Compatibility', function () {
    it('should work with callback-style API', function (done) {
      env.sql.open(connectionString, (err, conn) => {
        if (err) {
          done(new Error(`Failed to open connection: ${err.message}`))
          return
        }

        conn.query('SELECT 1 as n', (err, results) => {
          if (err) {
            conn.close(() => {
              done(new Error(`Query failed: ${err.message}`))
            })
            return
          }

          try {
            expect(results).to.have.lengthOf(1)
            expect(results[0]).to.deep.equal({ n: 1 })

            conn.close((err) => {
              if (err) {
                done(new Error(`Failed to close connection: ${err.message}`))
              } else {
                done()
              }
            })
          } catch (assertErr) {
            conn.close(() => {
              done(assertErr)
            })
          }
        })
      })
    })

    it('should handle callback errors properly', function (done) {
      const invalidConnectionString = 'Server=invalid;Database=invalid;'

      env.sql.open(invalidConnectionString, (err, conn) => {
        try {
          assert.isObject(err, 'Should receive an error object')
          assert.property(err, 'message', 'Error should have a message')
          done()
        } catch (assertErr) {
          done(assertErr)
        }
      })
    })
  })
})
