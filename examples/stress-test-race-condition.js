'use strict'

/**
 * Stress Test for Issue #378: Race Condition causing double-free crash
 *
 * This test attempts to reproduce the race condition between:
 * - ReleaseWorker (statement cleanup on query completion/error)
 * - CloseWorker (connection close)
 *
 * The scenario that caused the crash:
 * 1. Query encounters an error (e.g., database unavailable)
 * 2. Error handler immediately calls conn.close()
 * 3. ReleaseWorker and CloseWorker race to free the same statement handle
 *
 * Run with:
 *   MSNODESQLV8_TEST_VERBOSE=true node examples/stress-test-race-condition.js
 *
 * Or with custom connection string:
 *   CONNECTION_STRING="Driver={...};Server=...;Database=...;Trusted_Connection=yes;" node examples/stress-test-race-condition.js
 */

const sql = require('../lib/sql')

// Configuration
const ITERATIONS = process.env.ITERATIONS ? parseInt(process.env.ITERATIONS) : 100
const CONCURRENT_CONNECTIONS = process.env.CONCURRENT ? parseInt(process.env.CONCURRENT) : 10
const VERBOSE = process.env.MSNODESQLV8_TEST_VERBOSE === 'true'

// Get connection string from environment or use default
function getConnectionString() {
  if (process.env.CONNECTION_STRING) {
    return process.env.CONNECTION_STRING
  }

  // Try to load from .env-cmdrc
  try {
    const fs = require('fs')
    const path = require('path')
    const rcPath = path.join(__dirname, '../.env-cmdrc')
    if (fs.existsSync(rcPath)) {
      const config = JSON.parse(fs.readFileSync(rcPath, 'utf8'))
      // Try different keys that might have the connection string
      if (config.test) {
        const testConfig = config.test
        // Check if there's a CONNECTION_KEY pointing to another key
        if (testConfig.CONNECTION_KEY && testConfig[testConfig.CONNECTION_KEY]) {
          return testConfig[testConfig.CONNECTION_KEY]
        }
        // Try common keys
        if (testConfig.SQLSERVER_WSL_DEV18) return testConfig.SQLSERVER_WSL_DEV18
        if (testConfig.DOCKER) return testConfig.DOCKER
        if (testConfig.DEFAULT) return testConfig.DEFAULT
      }
      if (config.LINUX?.DEFAULT) return config.LINUX.DEFAULT
      if (config.DEFAULT) return config.DEFAULT
    }
  } catch (e) {
    console.warn('Warning: Could not read .env-cmdrc:', e.message)
  }

  // Default connection string
  return 'Driver={ODBC Driver 18 for SQL Server};Server=localhost;Database=node;Trusted_Connection=yes;Encrypt=no;'
}

const connectionString = getConnectionString()

if (!connectionString) {
  console.error('ERROR: No connection string found.')
  console.error('Please set CONNECTION_STRING environment variable or create .env-cmdrc file.')
  console.error('')
  console.error('Example:')
  console.error('  CONNECTION_STRING="Driver={ODBC Driver 18 for SQL Server};Server=localhost;Database=node;Trusted_Connection=yes;Encrypt=no;" node examples/stress-test-race-condition.js')
  process.exit(1)
}

// Configure logging if verbose mode
if (VERBOSE) {
  sql.logger.configure({
    level: 'TRACE',
    destinations: ['console'],
    includeTimestamp: true,
    includeLevel: true,
    includeSource: true
  })
  console.log('Verbose logging enabled')
}

// Statistics
let totalOpened = 0
let totalClosed = 0
let totalErrors = 0
let totalSuccess = 0
let crashes = 0

function log(msg) {
  if (VERBOSE) {
    console.log(`[${new Date().toISOString()}] ${msg}`)
  }
}

/**
 * Scenario 1: Query with immediate close on error
 * This mimics the user's code pattern that caused the crash
 */
async function scenarioErrorClose(iteration) {
  return new Promise((resolve) => {
    log(`[${iteration}] Opening connection...`)

    sql.open(connectionString, (err, conn) => {
      if (err) {
        log(`[${iteration}] Connection error: ${err.message}`)
        totalErrors++
        resolve()
        return
      }

      totalOpened++
      log(`[${iteration}] Connection opened, executing query that will error...`)

      // Execute a query that will fail (non-existent database)
      // This triggers the error path
      const pm = conn.procedureMgr()
      pm.setTimeout(1000)

      // Try to call a non-existent procedure - this will error
      pm.getProc('NonExistentProcedure_' + iteration, (err, procedure) => {
        if (err) {
          log(`[${iteration}] Procedure error (expected): ${err.message}`)
          // Immediately close on error - this is the race condition trigger
          conn.close((closeErr) => {
            if (closeErr) {
              log(`[${iteration}] Close error: ${closeErr.message}`)
              totalErrors++
            } else {
              log(`[${iteration}] Connection closed after error`)
              totalClosed++
              totalSuccess++
            }
            resolve()
          })
        } else {
          // Unlikely path
          conn.close(() => {
            totalClosed++
            resolve()
          })
        }
      })
    })
  })
}

/**
 * Scenario 2: Query with rapid close on success
 * Tests the normal completion path + immediate close
 */
async function scenarioSuccessClose(iteration) {
  return new Promise((resolve) => {
    log(`[${iteration}] Opening connection...`)

    sql.open(connectionString, (err, conn) => {
      if (err) {
        log(`[${iteration}] Connection error: ${err.message}`)
        totalErrors++
        resolve()
        return
      }

      totalOpened++
      log(`[${iteration}] Connection opened, executing simple query...`)

      // Execute a simple query
      const query = conn.query('SELECT 1 as test')

      query.on('done', () => {
        log(`[${iteration}] Query done, immediately closing...`)
        // Immediately close on success
        conn.close((closeErr) => {
          if (closeErr) {
            log(`[${iteration}] Close error: ${closeErr.message}`)
            totalErrors++
          } else {
            log(`[${iteration}] Connection closed after success`)
            totalClosed++
            totalSuccess++
          }
          resolve()
        })
      })

      query.on('error', (err) => {
        log(`[${iteration}] Query error: ${err.message}`)
        conn.close((closeErr) => {
          totalClosed++
          totalErrors++
          resolve()
        })
      })
    })
  })
}

/**
 * Scenario 3: Invalid query with event-based close
 * Uses the exact pattern from issue #378
 */
async function scenarioEventBasedClose(iteration) {
  return new Promise((resolve) => {
    log(`[${iteration}] Opening connection...`)

    sql.open(connectionString, (err, conn) => {
      if (err) {
        log(`[${iteration}] Connection error: ${err.message}`)
        totalErrors++
        resolve()
        return
      }

      totalOpened++
      log(`[${iteration}] Connection opened, executing invalid query...`)

      // Execute an invalid query that will error
      const query = conn.query('SELECT * FROM NonExistentTable_' + iteration)

      query.on('done', () => {
        log(`[${iteration}] Query done (unexpected), closing...`)
        conn.close(() => {
          totalClosed++
          totalSuccess++
          resolve()
        })
      })

      query.on('error', (err) => {
        log(`[${iteration}] Query error (expected): ${err.message}`)
        // Immediately close on error - exact pattern from issue #378
        conn.close((closeErr) => {
          if (closeErr) {
            log(`[${iteration}] Close error: ${closeErr.message}`)
            totalErrors++
          } else {
            log(`[${iteration}] Connection closed after query error`)
            totalClosed++
            totalSuccess++
          }
          resolve()
        })
      })

      query.on('info', (info) => {
        log(`[${iteration}] Info: ${info}`)
      })

      query.on('free', () => {
        log(`[${iteration}] Statement freed`)
      })
    })
  })
}

/**
 * Run multiple scenarios concurrently
 */
async function runConcurrentScenarios(batch, scenarios) {
  const promises = []

  for (let i = 0; i < CONCURRENT_CONNECTIONS; i++) {
    const iteration = batch * CONCURRENT_CONNECTIONS + i
    // Randomly pick a scenario
    const scenarioIndex = i % scenarios.length
    const scenario = scenarios[scenarioIndex]
    promises.push(scenario(iteration))
  }

  await Promise.all(promises)
}

async function main() {
  console.log('='.repeat(70))
  console.log('Stress Test for Issue #378: Race Condition / Double-Free')
  console.log('='.repeat(70))
  console.log(`Configuration:`)
  console.log(`  - Iterations: ${ITERATIONS}`)
  console.log(`  - Concurrent connections: ${CONCURRENT_CONNECTIONS}`)
  console.log(`  - Verbose: ${VERBOSE}`)
  console.log(`  - Connection: ${connectionString.substring(0, 50)}...`)
  console.log('='.repeat(70))
  console.log('')

  const scenarios = [
    scenarioErrorClose,
    scenarioSuccessClose,
    scenarioEventBasedClose
  ]

  const startTime = Date.now()

  try {
    const batches = Math.ceil(ITERATIONS / CONCURRENT_CONNECTIONS)

    for (let batch = 0; batch < batches; batch++) {
      const progress = Math.round((batch / batches) * 100)
      process.stdout.write(`\rProgress: ${progress}% (batch ${batch + 1}/${batches})`)

      await runConcurrentScenarios(batch, scenarios)

      // Small delay between batches to allow cleanup
      await new Promise(resolve => setTimeout(resolve, 10))
    }

    process.stdout.write('\r' + ' '.repeat(60) + '\r')

  } catch (err) {
    console.error('\n\nFATAL ERROR:', err)
    crashes++
  }

  const duration = Date.now() - startTime

  console.log('')
  console.log('='.repeat(70))
  console.log('Results:')
  console.log('='.repeat(70))
  console.log(`  Total time:         ${duration}ms`)
  console.log(`  Connections opened: ${totalOpened}`)
  console.log(`  Connections closed: ${totalClosed}`)
  console.log(`  Successful cycles:  ${totalSuccess}`)
  console.log(`  Errors (expected):  ${totalErrors}`)
  console.log(`  Crashes:            ${crashes}`)
  console.log('='.repeat(70))

  if (crashes === 0 && totalOpened > 0 && totalOpened === totalClosed) {
    console.log('')
    console.log('SUCCESS: No crashes detected!')
    console.log('The race condition fix appears to be working.')
    console.log('')
    process.exit(0)
  } else {
    console.log('')
    console.log('WARNING: Potential issues detected')
    if (crashes > 0) {
      console.log(`  - ${crashes} crashes occurred`)
    }
    if (totalOpened !== totalClosed) {
      console.log(`  - Connection leak: opened ${totalOpened}, closed ${totalClosed}`)
    }
    console.log('')
    process.exit(1)
  }
}

// Handle uncaught exceptions (the crash scenario)
process.on('uncaughtException', (err) => {
  console.error('\n\n!!! UNCAUGHT EXCEPTION - CRASH DETECTED !!!')
  console.error(err)
  crashes++
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n\n!!! UNHANDLED REJECTION !!!')
  console.error(reason)
  crashes++
})

// Run the test
main().catch(err => {
  console.error('Test failed:', err)
  process.exit(1)
})
