'use strict'
/* global suite teardown teardown test setup */

var supp = require('../samples/typescript/demo-support')
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
      connStr = global.conn_str || co.conn_str
      async = co.async
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

  function setupSimpleType (tableName, done) {
    var schemaName = 'dbo'
    var unqualifiedTableName = tableName
    var schemaIndex = tableName.indexOf('.')
    if (schemaIndex > 0) {
      schemaName = tableName.substr(0, schemaIndex)
      unqualifiedTableName = tableName.substr(schemaIndex + 1)
    }
    var createSchemaSql = 'IF NOT EXISTS (\n' +
      'SELECT schema_name\n' +
        'FROM  information_schema.schemata\n' +
        'WHERE schema_name = \'' + schemaName + '\')\n' +
        'BEGIN\n' +
        ' EXEC sp_executesql N\'CREATE SCHEMA ' + schemaName + '\'\n' +
        'END'

    var tableTypeName = tableName + 'Type'
    var insertProcedureTypeName = schemaName + '.Insert' + unqualifiedTableName
    var table

    var dropTableSql = 'IF OBJECT_ID(\'' + tableName + '\', \'U\') IS NOT NULL \n' +
      '  DROP TABLE ' + tableName + ';'

    var dropProcedureSql = 'IF EXISTS (SELECT * FROM sys.objects WHERE type = \'P\' AND OBJECT_ID = OBJECT_ID(\'' + insertProcedureTypeName + '\'))\n' +
      ' begin' +
      ' drop PROCEDURE ' + insertProcedureTypeName +
      ' end '

    var createTableSql = 'create TABLE ' + tableName + '(\n' +
      '\tusername nvarchar(30), \n' +
      '\tage int, \n' +
      '\tsalary real\n' +
      ')'

    var dropTypeSql = 'IF TYPE_ID(N\'' + tableTypeName + '\') IS not NULL drop type ' + tableTypeName

    var createTypeSql = 'CREATE TYPE ' + tableTypeName + ' AS TABLE (username nvarchar(30), age int, salary real)'

    var insertProcedureSql = 'create PROCEDURE ' + insertProcedureTypeName + '\n' +
      '@tvp ' + tableTypeName + ' READONLY\n' +
      'AS\n' +
      'BEGIN\n' +
      ' set nocount on\n' +
      ' INSERT INTO ' + tableName + '\n' +
      '(\n' +
      '   [username],\n' +
      '   [age],\n' +
      '   [salary]\n' +
      ' )\n' +
      ' SELECT \n' +
      ' [username],\n' +
      ' [age],\n' +
      ' [salary]\n' +
      'n' +
      ' FROM @tvp tvp\n' +
      'END'

    var fns = [

      function (asyncDone) {
        theConnection.query(createSchemaSql, function (err) {
          assert.ifError(err)
          asyncDone()
        })
      },

      function (asyncDone) {
        theConnection.query(dropProcedureSql, function (err) {
          assert.ifError(err)
          asyncDone()
        })
      },

      function (asyncDone) {
        theConnection.query(dropTableSql, function (err) {
          assert.ifError(err)
          asyncDone()
        })
      },

      function (asyncDone) {
        theConnection.query(createTableSql, function (err) {
          assert.ifError(err)
          asyncDone()
        })
      },

      function (asyncDone) {
        theConnection.query(dropTypeSql, function (err) {
          assert.ifError(err)
          asyncDone()
        })
      },

      function (asyncDone) {
        theConnection.query(createTypeSql, function (err) {
          assert.ifError(err)
          asyncDone()
        })
      },

      function (asyncDone) {
        theConnection.query(insertProcedureSql, function (err) {
          assert.ifError(err)
          asyncDone()
        })
      },

      function (asyncDone) {
        theConnection.getUserTypeTable(tableTypeName, function (err, t) {
          assert.ifError(err)
          table = t
          assert(table.columns.length === 3)
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      done(table)
    })
  }

  var vec = [
    {
      username: 'santa',
      age: 1000,
      salary: 0
    },
    {
      username: 'md',
      age: 28,
      salary: 100000
    }
  ]

  test('use tvp simple test type insert test using pm', function (testDone) {
    var tableName = 'TestTvp'
    var table
    var procedure

    var fns = [

      function (asyncDone) {
        setupSimpleType(tableName, function (t) {
          table = t
          table.addRowsFromObjects(vec)
          asyncDone()
        })
      },

      function (asyncDone) {
        var pm = theConnection.procedureMgr()
        pm.get('insertTestTvp', function (p) {
          assert(p)
          procedure = p
          asyncDone()
        })
      },

      function (asyncDone) {
        var tp = sql.TvpFromTable(table)
        table.rows = []
        procedure.call([tp], function (err) {
          assert.ifError(err)
          asyncDone()
        })
      },

      function (asyncDone) {
        theConnection.query('select * from ' + tableName, function (err, res) {
          assert.ifError(err)
          assert.deepEqual(vec, res)
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('non dbo schema use tvp simple test type select test', function (testDone) {
    var tableName = 'TestSchema.TestTvp'
    var table

    var fns = [

      function (asyncDone) {
        setupSimpleType(tableName, function (t) {
          table = t
          table.addRowsFromObjects(vec)
          asyncDone()
        })
      },

      function (asyncDone) {
        var tp = sql.TvpFromTable(table)
        table.rows = []
        theConnection.query('select * from ?;', [tp], function (err, res) {
          assert.ifError(err)
          assert.deepEqual(res, vec)
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('use tvp simple test type select test', function (testDone) {
    var tableName = 'TestTvp'
    var table

    var fns = [

      function (asyncDone) {
        setupSimpleType(tableName, function (t) {
          table = t
          table.addRowsFromObjects(vec)
          asyncDone()
        })
      },

      function (asyncDone) {
        var tp = sql.TvpFromTable(table)
        table.rows = []
        theConnection.query('select * from ?;', [tp], function (err, res) {
          assert.ifError(err)
          assert.deepEqual(res, vec)
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('use tvp simple test type insert test', function (testDone) {
    var tableName = 'TestTvp'
    var table

    var fns = [

      function (asyncDone) {
        setupSimpleType(tableName, function (t) {
          table = t
          table.addRowsFromObjects(vec)
          asyncDone()
        })
      },

      function (asyncDone) {
        var tp = sql.TvpFromTable(table)
        table.rows = []
        theConnection.query('exec insertTestTvp @tvp = ?;', [tp], function (err) {
          assert.ifError(err)
          asyncDone()
        })
      },

      function (asyncDone) {
        theConnection.query('select * from ' + tableName, function (err, res) {
          assert.ifError(err)
          assert.deepEqual(vec, res)
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

    var fns = [

      function (asyncDone) {
        helper.dropCreateTable({
          tableName: tableName
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
        var parsedJSON = helper.getJSON()
        // construct a table type based on a table definition.
        var table = bulkMgr.asTableType()
        // convert a set of objects to rows
        table.addRowsFromObjects(parsedJSON)
        // use a type the native driver can understand, using column based bulk binding.
        var tp = sql.TvpFromTable(table)
        theConnection.query('select * from ?;', [tp], function (err, res) {
          assert.ifError(err)
          assert.deepEqual(res, parsedJSON)
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
          tableName: tableName
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
