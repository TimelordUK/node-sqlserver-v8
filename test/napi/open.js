// test/napi/open.js
'use strict'

const chai = require('chai')
const assert = chai.assert
const testConnection = require('../common/test-connection')
const sql = require('msnodesqlv8')
sql.setLogLevel(4) // Debug level
sql.enableConsoleLogging(true)

describe('open', function () {
  let connection = null

  this.beforeEach(async () => {
    connection = await testConnection.createConnection()
  })

  this.afterEach(async function () {
    if (connection) {
      await connection.promises.close()
    }
  })

  it('will call open on the cpp object', async () => {
    console.log('conn open')
    assert(connection !== null)
  })
})
