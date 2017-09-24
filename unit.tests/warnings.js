'use strict'

/* global suite test setup */

var assert = require('assert')
var supp = require('../demo-support')

suite('warnings', function () {
  var connStr
  var theConnection
  var support
  var async
  var helper
  var procedureHelper
  var sql = global.native_sql

  this.timeout(20000)

  setup(function (testDone) {
    supp.GlobalConn.init(sql, function (co) {
      connStr = co.conn_str
      support = co.support
      procedureHelper = new support.ProcedureHelper(connStr)
      procedureHelper.setVerbose(false)
      async = co.async
      helper = co.helper
      helper.setVerbose(false)
      sql.open(connStr, function (err, conn) {
        theConnection = conn
        assert.ifError(err)
        testDone()
      })
    })
  })

  var joinFailTestQry =
    'SELECT tmp. * ' +
    'FROM (' +
    ' SELECT 1 [id], \'test1\' [value]' +
    ' UNION ALL select 2, \'test2\'' +
    ') tmp ' +
    ' INNER MERGE JOIN (' +
    ' SELECT 1 [id2],\'jointest1\' [value2] ' +
    ' UNION ALL select 2, \'jointest2\'' +
    ') tmp2 ON tmp.id = tmp2.id2 ' +
    ' OPTION (RECOMPILE);'

  var nullEliminatedTestQry =
    'SELECT ' +
    ' SUM(tmp.[A])' +
    ' FROM ( ' +
    ' SELECT 1 [A], 2 [B], 3 [C] ' +
    ' UNION ALL SELECT NULL, 5, 6 ' +
    ' UNION ALL SELECT 7, NULL, NULL ' +
    ' ) as tmp ' +
    ' OPTION (RECOMPILE);'

  function testQry (qry, done) {
    var errors = []
    var warnings = []
    var stmt = theConnection.queryRaw(qry)
    stmt.on('error', function (err) {
      errors.push(err)
    })
    stmt.on('warning', function (err) {
      warnings.push(err)
    })
    stmt.on('done', function () {
      done(warnings, errors)
    })
  }

  function testPrepared (qry, done) {
    var errors = []
    var warnings = []
    theConnection.prepare(qry, function (e, ps) {
      ps.preparedQuery([1], function (err) {
        if (err) {
          errors.push(err)
        }
        ps.free(function () {
          done(warnings, errors)
        })
      })
    })
  }

  function testSP (done) {
    var errors = []
    var warnings = []
    var pm = theConnection.procedureMgr()
    var sp = pm.callproc('tstWarning')

    sp.on('error', function (err) {
      errors.push(err)
      done(warnings, errors)
    })
    sp.on('warning', function (err) {
      warnings.push(err)
      done(warnings, errors)
    })
  }

  /*
    testSP(connStr, 'TEST FIVE - Stord Proc - JOIN HINT WARNING')
    */

  test('TEST ONE - Query - JOIN HINT WARNING', function (testDone) {
    var fns = [
      function (asyncDone) {
        testQry(joinFailTestQry, function (warnings, errors) {
          assert(warnings.length === 1)
          assert(errors.length === 0)
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('TEST TWO - Query - NULL ELIMNATED WARNING', function (testDone) {
    var fns = [
      function (asyncDone) {
        testQry(nullEliminatedTestQry, function (warnings, errors) {
          assert(errors.length === 0)
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('TEST THREE - Prepared Query - JOIN HINT WARNING', function (testDone) {
    var fns = [
      function (asyncDone) {
        testPrepared(joinFailTestQry, function (warnings, errors) {
          assert(errors.length === 0)
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('TEST FOUR - Prepared Query - NULL ELIMNATED WARNING', function (testDone) {
    var fns = [
      function (asyncDone) {
        testPrepared(nullEliminatedTestQry, function (warnings, errors) {
          assert(errors.length === 0)
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('TEST FIVE - Stord Proc - JOIN HINT WARNING', function (testDone) {
    var fns = [
      function (asyncDone) {
        testSP(function (warnings, errors) {
          assert(errors.length === 1)
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })
})
