/* global suite teardown teardown test setup */
'use strict'

var assert = require('assert')
var supp = require('../samples/typescript/demo-support')

suite('querytimeout', function () {
  this.timeout(20 * 1000)
  var sql = global.native_sql

  var theConnection
  var connStr
  var helper

  setup(function (testDone) {
    supp.GlobalConn.init(sql, function (co) {
      connStr = global.conn_str || co.conn_str
      helper = co.helper
      helper.setVerbose(false)
      sql.open(connStr, function (err, newConn) {
        assert(err === false)
        theConnection = newConn
        testDone()
      })
    }, global.conn_str)
  })

  teardown(function (done) {
    theConnection.close(function (err) {
      assert.ifError(err)
      done()
    })
  })

  test('test timeout 2 secs on waitfor delay 10', function (testDone) {
    var queryObj = {
      query_str: 'waitfor delay \'00:00:10\';',
      query_timeout: 2
    }

    theConnection.query(queryObj, function (err) {
      assert(err)
      assert(err.message.indexOf('Query timeout expired') > 0)
      testDone()
    })
  })

  test('test timeout 10 secs on waitfor delay 2', function (testDone) {
    var queryObj = {
      query_str: 'waitfor delay \'00:00:2\';',
      query_timeout: 10
    }

    theConnection.query(queryObj, function (err) {
      assert.ifError(err)
      testDone()
    })
  })

  test('test timeout 0 secs on waitfor delay 4', function (testDone) {
    var queryObj = {
      query_str: 'waitfor delay \'00:00:4\';'
    }

    theConnection.query(queryObj, function (err) {
      assert.ifError(err)
      testDone()
    })
  })
})
