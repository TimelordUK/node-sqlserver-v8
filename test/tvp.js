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

  test('use tvp simple test type', function (testDone) {
    var tableName = 'Employee'
    var table

    var vec = [
      {
        username:'santa',
        age:1000,
        salary:0
      },
      {
        username:'md',
        age:28,
        salary:100000
      }
    ]

    var fns = [

      function (asyncDone) {
        helper.dropCreateTable({
          name: tableName
        }, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        var sql = 'IF TYPE_ID(N\'TestTvpType\') IS not NULL'
        sql += ' drop type TestTvpType'
        theConnection.query(sql, function (err) {
          assert.ifError(err)
          asyncDone()
        })
      },

      function (asyncDone) {
        var sql = 'CREATE TYPE TestTvpType AS TABLE (username nvarchar(30), age int, salary real)'
        theConnection.query(sql, function (err) {
          assert.ifError(err)
          asyncDone()
        })
      },

      function (asyncDone) {
        theConnection.getUserTypeTable('TestTvpType', function (err, t) {
          assert.ifError(err)
          table = t
          assert(table.columns.length === 3)
          table.addRowsFromObjects(vec)
          asyncDone()
        })
      },

      function (asyncDone) {
      var tp = sql.TvpFromTable(table)
        theConnection.query('select * from ?;', [tp], function(err, res) {
          assert.deepEqual(res,vec)
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('use tvp to select from table type complex object Employee type', function (testDone) {
    var tableName = 'Employee'
    var bulkMgr
    var selectSql

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

      function(asyncDone) {
        var pm = theConnection.procedureMgr()
        pm.get('EmployeeTvpSelect', function (proc) {
          selectSql = proc.getMeta().select
          asyncDone()
        })
      },

      function (asyncDone) {
        var parsedJSON = helper.getJSON()
        // construct a table type based on a table definition.
        var table = bulkMgr.asTableType()
        // convert a set of objects to rows
        table.addRowsFromObjects(parsedJSON)
        // use a type the native driver can understand, using column based bulk binding.
        var tp = sql.TvpFromTable(table)
        theConnection.query('select * from ?;', [tp], function(err, res) {
          assert.deepEqual(res,parsedJSON)
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
        theConnection.getUserTypeTable('EmployeeType', function (err, def) {
          assert.ifError(err)
          var summary = bulkMgr.getSummary()
          assert(def.columns.length = summary.columns.length)
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