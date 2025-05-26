/**
 * WebStorm-optimized connection test file
 * @description Connection tests with explicit test annotations for IDE integration
 */

'use strict'

const { describe, it, beforeEach, afterEach } = require('mocha')
const { assert, expect } = require('chai')
const { TestEnv } = require('./env/test-env')

/**
 * @test {Connection}
 */
describe('Connection Tests - WebStorm Enhanced', function () {
  let env
  let connectionString

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
      console.error('Setup failed:', err)
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
      console.error('Teardown failed:', err)
      throw err
    }
  })

  /**
   * @test
   */
  it('should open and close connection with promise API', async function () {
    let conn = null

    try {
      // Test connection open
      conn = await env.sql.promises.open(connectionString)
      assert.exists(conn, 'Connection should exist')

      // Test simple query
      const result = await conn.promises.query('SELECT 1 as test')
      assert.isArray(result, 'Result should be an array')
      assert.lengthOf(result, 1, 'Should return one row')
      assert.deepEqual(result[0], { test: 1 })
    } catch (err) {
      assert.fail(`Connection test failed: ${err.message}\n${err.stack}`)
    } finally {
      // Ensure cleanup
      if (conn) {
        try {
          await conn.promises.close()
        } catch (closeErr) {
          console.error('Failed to close connection:', closeErr)
        }
      }
    }
  })

  /**
   * @test
   */
  it('should handle connection errors with clear messages', async function () {
    const badConnectionString = 'Server=non.existent.server;Database=fake;Trusted_Connection=yes;'

    try {
      await env.sql.promises.open(badConnectionString)
      assert.fail('Expected connection to fail')
    } catch (err) {
      assert.exists(err, 'Error should exist')
      assert.exists(err.message, 'Error should have message')
      console.log('Expected error received:', err.message)
    }
  })

  /**
   * @test
   */
  it('should prevent hanging on async errors', async function () {
    let conn = null
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => { reject(new Error('Test timed out')) }, 5000)
    })

    try {
      conn = await env.sql.promises.open(connectionString)

      // Race between query and timeout
      const result = await Promise.race([
        conn.promises.query('SELECT 1 as value'),
        timeoutPromise
      ])

      assert.exists(result, 'Should get result before timeout')
      assert.deepEqual(result[0], { value: 1 })
    } catch (err) {
      assert.fail(`Test failed: ${err.message}`)
    } finally {
      if (conn) {
        await conn.promises.close()
      }
    }
  })

  /**
   * @test
   */
  it('should handle callback API with proper error propagation', function (done) {
    const testTimeout = setTimeout(() => {
      done(new Error('Test timed out - callback never fired'))
    }, 5000)

    env.sql.open(connectionString, (err, conn) => {
      if (err) {
        clearTimeout(testTimeout)
        done(err)
        return
      }

      conn.query('SELECT 2 as num', (queryErr, results) => {
        if (queryErr) {
          conn.close(() => {
            clearTimeout(testTimeout)
            done(queryErr)
          })
          return
        }

        try {
          assert.deepEqual(results[0], { num: 2 })

          conn.close((closeErr) => {
            clearTimeout(testTimeout)
            done(closeErr)
          })
        } catch (assertErr) {
          conn.close(() => {
            clearTimeout(testTimeout)
            done(assertErr)
          })
        }
      })
    })
  })
})
