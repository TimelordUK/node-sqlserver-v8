'use strict'
/* global suite teardown teardown test setup */

var supp = require('../samples/typescript/demo-support')
var assert = require('assert')

suite('geography', function () {
  var theConnection
  this.timeout(20000)
  var connStr
  var async
  var helper

  var sql = global.native_sql

  setup(function (testDone) {
    supp.GlobalConn.init(sql, function (co) {
      connStr = global.conn_str || co.conn_str
      async = co.async
      helper = co.helper
      helper.setVerbose(false)
      sql.open(connStr, function (err, newConn) {
        assert.ifError(err)
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
  test('prepare a geography statement for repeat invocations', function (testDone) {
    var preparedPoint = null
    var points = [
      'POINT (-89.349 -55.349)',
      'POINT (1.349 -9.349)'
    ]

    var expected = [
      {
        id: 1,
        GeogCol2: points[0]
      },
      {
        id: 2,
        GeogCol2: points[1]
      }
    ]

    var fns = [

      function (asyncDone) {
        theConnection.query('DROP TABLE spatial_test', function () {
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.query('CREATE TABLE spatial_test ( id int IDENTITY (1,1), GeogCol1 geography, GeogCol2 AS GeogCol1.STAsText() )', function (e) {
          assert.ifError(e)
          asyncDone()
        })
      },
      function (asyncDone) {
        var sql = 'INSERT INTO spatial_test (GeogCol1) VALUES (geography::STPointFromText(?, 4326))'
        theConnection.prepare(sql, function (err, prepared) {
          assert.ifError(err)
          preparedPoint = prepared
          asyncDone()
        })
      },
      function (asyncDone) {
        preparedPoint.preparedQuery([points[0]], function (err, res) {
          assert.ifError(err)
          assert(res.length === 0)
          asyncDone()
        })
      },
      function (asyncDone) {
        preparedPoint.preparedQuery([points[1]], function (err, res) {
          assert.ifError(err)
          assert(res.length === 0)
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.query('select id, GeogCol2 from spatial_test', function (err, res) {
          assert.ifError(err)
          assert(res.length === 2)
          assert.deepEqual(res, expected)
          asyncDone()
        })
      }
    ]
    async.series(fns, function () {
      testDone()
    })
  })
})
