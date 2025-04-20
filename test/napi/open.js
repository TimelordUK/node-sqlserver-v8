// test/napi/open.js
'use strict'

const chai = require('chai')
const assert = chai.assert
const testConnection = require('../common/test-connection')
const sql = require('msnodesqlv8')
sql.setLogLevel(4); // Debug level
sql.enableConsoleLogging(true);

describe('open', function () {
  let connection = null
  
  this.beforeEach(done => {
    testConnection.createConnection((err, conn) => {
      connection = conn
      done(err)
    })
  })

  this.afterEach(done => {
    if (connection) {
      connection.close(done)
    } else {
      done()
    }
  })

  it('will call open on the cpp object', done => {
    console.log('conn open')
    assert(connection !== null)
    done()
  })
})