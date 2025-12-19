'use strict'

/**
 * Test for Issue #379: sql.query() throws uncaught exception instead of
 * passing error to callback when database doesn't exist.
 */

const sql = require('./lib/sql')

// Get base connection string and modify to use non-existent database
function getConnectionString() {
  try {
    const fs = require('fs')
    const path = require('path')
    const rcPath = path.join(__dirname, '.env-cmdrc')
    if (fs.existsSync(rcPath)) {
      const config = JSON.parse(fs.readFileSync(rcPath, 'utf8'))
      if (config.test) {
        const testConfig = config.test
        if (testConfig.CONNECTION_KEY && testConfig[testConfig.CONNECTION_KEY]) {
          return testConfig[testConfig.CONNECTION_KEY]
        }
      }
    }
  } catch (e) {
    // ignore
  }
  return 'Driver={ODBC Driver 18 for SQL Server};Server=127.0.0.1,1433;Database=node;UID=sa;PWD=Password_123#;TrustServerCertificate=yes;'
}

// Modify connection string to use non-existent database
const baseConnectionString = getConnectionString()
const badConnectionString = baseConnectionString.replace(/Database=[^;]+/, 'Database=NonExistentDB_12345')

console.log('='.repeat(70))
console.log('Test for Issue #379: sql.query() error handling')
console.log('='.repeat(70))
console.log('')
console.log('Base connection:', baseConnectionString.substring(0, 60) + '...')
console.log('Bad connection:', badConnectionString.substring(0, 60) + '...')
console.log('')

// Track if callback was called
let callbackCalled = false

// Set up uncaught exception handler
process.on('uncaughtException', (err) => {
  console.error('')
  console.error('!!! UNCAUGHT EXCEPTION !!!')
  console.error('Error:', err.message)
  console.error('Stack:', err.stack)
  console.error('')
  console.error('This is the bug - error should have gone to callback, not thrown!')
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('')
  console.error('!!! UNHANDLED REJECTION !!!')
  console.error('Reason:', reason)
  console.error('')
  console.error('This is a bug - rejection should have been handled!')
  process.exit(1)
})

console.log('Test 1: sql.query() with non-existent database')
console.log('-'.repeat(70))

sql.query(badConnectionString, 'SELECT 1 as test', (err, results) => {
  callbackCalled = true

  if (err) {
    console.log('SUCCESS: Error was passed to callback (expected behavior)')
    console.log('Error message:', err.message)
    console.log('')
    runTest2()
  } else {
    console.log('UNEXPECTED: Query succeeded?', results)
    runTest2()
  }
})

// Give it a few seconds, then check if callback was called
setTimeout(() => {
  if (!callbackCalled) {
    console.error('')
    console.error('TIMEOUT: Callback was never called!')
    console.error('This might indicate the error was swallowed or thrown elsewhere.')
    process.exit(1)
  }
}, 10000)

function runTest2() {
  console.log('Test 2: sql.open() with non-existent database')
  console.log('-'.repeat(70))

  sql.open(badConnectionString, (err, conn) => {
    if (err) {
      console.log('SUCCESS: Error was passed to callback (expected behavior)')
      console.log('Error message:', err.message)
      console.log('')
      runTest3()
    } else {
      console.log('UNEXPECTED: Connection succeeded?')
      conn.close(() => runTest3())
    }
  })
}

function runTest3() {
  console.log('Test 3: sql.promises.query() with non-existent database')
  console.log('-'.repeat(70))

  sql.promises.query(badConnectionString, 'SELECT 1 as test')
    .then(results => {
      console.log('UNEXPECTED: Query succeeded?', results)
      finishTests()
    })
    .catch(err => {
      console.log('SUCCESS: Promise rejected (expected behavior)')
      console.log('Error message:', err.message)
      console.log('')
      finishTests()
    })
}

function finishTests() {
  console.log('='.repeat(70))
  console.log('All tests completed without uncaught exceptions!')
  console.log('='.repeat(70))
  process.exit(0)
}
