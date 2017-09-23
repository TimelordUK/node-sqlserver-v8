'use strict'
/* global suite teardown teardown test setup */

var supp = require('../demo-support')
var assert = require('assert')

suite('tvp', function () {
  var theConnection
  this.timeout(20000)
  var connStr
  var async
  var helper

  var sql = global.native_sql

  setup(function (testDone) {
    supp.GlobalConn.init(sql, function (co) {
      connStr = co.conn_str
      async = co.async
      helper = co.helper
      helper.setVerbose(false)
      sql.open(connStr, function (err, newConn) {
        assert.ifError(err)
        theConnection = newConn
        testDone()
      })
    })
  })

  teardown(function (done) {
    theConnection.close(function (err) {
      assert.ifError(err)
      done()
    })
  })

  //

  function populateTable(vec, table) {
    vec.forEach(function(v) {
      var row = []
      table.columns.forEach(function (col) {
        row.push(v[col.name])
      })
      table.rows.push(row)
    })
  }

  test('use tvp to select from table type', function (testDone) {
    var tableName = 'Employee'
    var bulkMgr

    var fns = [

      function (asyncDone) {
        helper.dropCreateTable({
          name: tableName
        }, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        var tm = theConnection.tableMgr()
        tm.bind(tableName, function (bulk) {
          bulkMgr = bulk
          asyncDone()
        })
      },

      function (asyncDone) {
        var sql = 'IF TYPE_ID(N\'EmployeeType\') IS not NULL'
        sql += ' drop type EmployeeType'
        theConnection.query(sql, function (err) {
          //assert.ifError(err)
          asyncDone()
        })
      },

      function (asyncDone) {
        var sql = bulkMgr.asUserType()
        theConnection.query(sql, function (err) {
          //assert.ifError(err)
          asyncDone()
        })
      },

      function (asyncDone) {
        var parsedJSON = helper.getJSON()
        var table = bulkMgr.asTableType()
        populateTable(parsedJSON, table)
        var q = 'exec EmployeeTvpSelect ( @tvp = ? )'
        var tp = sql.Tvp(table.name, table)
        theConnection.query(q, [tp], function(err, res) {
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('employee use tm to get a table value type representing table and create that user table type', function (testDone) {
    var tableName = 'Employee'
    var bulkMgr

    var fns = [

      function (asyncDone) {
        helper.dropCreateTable({
          name: tableName
        }, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        var tm = theConnection.tableMgr()
        tm.bind(tableName, function (bulk) {
          bulkMgr = bulk
          asyncDone()
        })
      },

      function (asyncDone) {
        var sql = 'IF TYPE_ID(N\'EmployeeType\') IS not NULL'
        sql += ' drop type EmployeeType'
        theConnection.query(sql, function (err) {
          assert.ifError(err)
          asyncDone()
        })
      },

      function (asyncDone) {
        var sql = bulkMgr.asUserType()
        theConnection.query(sql, function (err) {
          assert.ifError(err)
          asyncDone()
        })
      },

      function (asyncDone) {
        var sqlMeta = sql.metaResolver
        sqlMeta.getUserType(theConnection, 'EmployeeType', function (err, def) {
          assert.ifError(err)
          var summary = bulkMgr.getSummary()
          assert(def.length = summary.columns.length)
          var t = bulkMgr.asTableType()
          assert(t.columns.length === summary.columns.length)
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

})