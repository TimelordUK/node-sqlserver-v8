var assert = require('assert'),
  supp = require('../demo-support'),
  fs = require('fs')

suite('querycancel', function () {
  this.timeout(30 * 1000)
  var sql = global.native_sql

  var theConnection
  var conn_str
  var support
  var async
  var helper
  var procedureHelper

  setup(function (done) {
    supp.GlobalConn.init(sql, function (co) {
      conn_str = co.conn_str
      support = co.support
      procedureHelper = new support.ProcedureHelper(conn_str)
      procedureHelper.setVerbose(false)
      async = co.async
      helper = co.helper
      helper.setVerbose(false)
      sql.open(conn_str, function (err, new_conn) {
        assert.ifError(err)
        theConnection = new_conn
        done()
      })
    })
  })

  teardown(function (done) {
    theConnection.close(function (err) {
      assert.ifError(err)
      done()
    })
  })

  test('cancel single query from notifier using tmp connection - expect Operation canceled', function (test_done) {
    var q = sql.query(conn_str, sql.PollingQuery('waitfor delay \'00:00:59\';'), function (err) {
      assert(err)
      assert(err.message.indexOf('Operation canceled') > 0)
      test_done()
    })
    q.on('submitted', function () {
      q.cancelQuery(function (err) {
        assert(!err)
      })
    })
  })

  test('cancel single waitfor - expect Operation canceled', function (test_done) {
    var q = theConnection.query(sql.PollingQuery('waitfor delay \'00:00:20\';'), function (err) {
      assert(err)
      assert(err.message.indexOf('Operation canceled') > 0)
      test_done()
    })

    theConnection.cancelQuery(q, function (err) {
      assert(!err)
    })
  })

  test('cancel single waitfor on non polling query - expect cancel error and query to complete', function (test_done) {
    var q = theConnection.query('waitfor delay \'00:00:3\';', function (err) {
      assert(!err)
      test_done()
    })

    theConnection.cancelQuery(q, function (err) {
      assert(err)
      assert(err.message.indexOf('only supported') > 0)
    })
  })

  test('cancel single waitfor using notifier - expect Operation canceled', function (test_done) {
    var q = theConnection.query(sql.PollingQuery('waitfor delay \'00:00:20\';'), function (err) {
      assert(err)
      assert(err.message.indexOf('Operation canceled') > 0)
      test_done()
    })

    q.cancelQuery(function (err) {
      assert(!err)
    })
  })

  test('nested cancel - expect Operation canceled on both', function (test_done) {
    var q1 = theConnection.query(sql.PollingQuery('waitfor delay \'00:00:50\';'), function (err) {
      assert(err.message.indexOf('Operation canceled') > 0)
      var q2 = theConnection.query(sql.PollingQuery('waitfor delay \'00:00:40\';'), function (err) {
        assert(err.message.indexOf('Operation canceled') > 0)
        test_done()
      })

      theConnection.cancelQuery(q2, function (err) {
        assert(!err)
      })
    })

    theConnection.cancelQuery(q1, function (err) {
      assert(!err)
    })
  })

  test('cancel single query - expect Operation canceled', function (test_done) {
    var q = theConnection.query(sql.PollingQuery('waitfor delay \'00:00:20\';'), function (err) {
      assert(err)
      assert(err.message.indexOf('Operation canceled') > 0)
      test_done()
    })

    theConnection.cancelQuery(q, function (err) {
      assert(!err)
    })
  })

  test('2 x cancel - expect Operation canceled on both', function (test_done) {
    var hits = 0

    function hit (err) {
      assert(err)
      assert(err.message.indexOf('Operation canceled') > 0)
      hits++
      if (hits === 2) {
        test_done()
      }
    }

    var q1 = theConnection.query(sql.PollingQuery('waitfor delay \'00:00:20\';'), function (err) {
      hit(err)
    })

    var q2 = theConnection.query(sql.PollingQuery('waitfor delay \'00:00:20\';'), function (err) {
      hit(err)
    })

    theConnection.cancelQuery(q1, function (err) {
      assert(!err)
    })

    theConnection.cancelQuery(q2, function (err) {
      assert(!err)
    })
  })

  test('waitfor delay 20 and delayed cancel- expect Operation canceled', function (test_done) {
    var q = theConnection.query(sql.PollingQuery('waitfor delay \'00:00:20\';'), function (err) {
      assert(err)
      assert(err.message.indexOf('Operation canceled') > 0)
      test_done()
    })

    setTimeout(function () {
      theConnection.cancelQuery(q, function (err) {
        assert(!err)
      })
    }, 100)
  })

  test('cancel single query and cancel again - expect Operation canceled and error', function (test_done) {
    var q = theConnection.query(sql.PollingQuery('waitfor delay \'00:00:20\';'), function (err) {
      assert(err)
      assert(err.message.indexOf('Operation canceled') > 0)
      setImmediate(function () {
        // now try and cancel again
        theConnection.cancelQuery(q, function (err) {
          assert(err)
          assert(err.message.indexOf('cannot cancel query') > 0)
          test_done()
        })
      })
    })

    theConnection.cancelQuery(q, function (err) {
      assert(!err)
    })
  })

  test('cancel single query and submit new query to prove connection still valid', function (test_done) {
    var q = theConnection.query(sql.PollingQuery('waitfor delay \'00:00:20\';'), function (err) {
      assert(err)
      assert(err.message.indexOf('Operation canceled') > 0)
      theConnection.query('SELECT 1 as x', [], function (err, res) {
        assert(!err)
        assert.deepEqual(res, [
          {
            x: 1
          }
        ])
        test_done()
      })
    })

    theConnection.cancelQuery(q, function (err) {
      assert(!err)
    })
  })

  test('cancel a prepared call that waits', function (test_done) {
    var s = 'waitfor delay ?;'
    var prepared

    var fns = [
      function (asyncDone) {
        theConnection.prepare(sql.PollingQuery(s), function (err, pq) {
          assert(!err)
          prepared = pq
          asyncDone()
        })
      },

      function (asyncDone) {
        var q = prepared.preparedQuery(['00:00:20'], function (err, res) {
          assert(err)
          assert(err.message.indexOf('Operation canceled') > 0)
          asyncDone()
        })

        q.on('submitted', function () {
          q.cancelQuery(function (err) {
            assert.ifError(err)
          })
        })
      }
    ]

    async.series(fns, function () {
      test_done()
    })
  })

  test('cancel a call to proc that waits for delay of input param.', function (test_done) {
    var sp_name = 'test_spwait_for'

    var def = 'alter PROCEDURE <name>' +
      '(\n' +
      '@timeout datetime' +
      '\n)' +
      'AS\n' +
      'BEGIN\n' +
      'waitfor delay @timeout;' +
      'END\n'

    var fns = [
      function (asyncDone) {
        procedureHelper.createProcedure(sp_name, def, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        var pm = theConnection.procedureMgr()
        pm.setPolling(true)
        var q = pm.callproc(sp_name, ['0:0:20'], function (err) {
          assert(err)
          assert(err.message.indexOf('Operation canceled') > 0)
          asyncDone()
        })
        q.on('submitted', function () {
          q.cancelQuery(function (err) {
            assert(!err)
          })
        })
      }
    ]

    async.series(fns, function () {
      test_done()
    })
  })
})
