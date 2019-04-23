
/* global suite teardown teardown test setup */
'use strict'

const assert = require('assert')
const supp = require('../samples/typescript/demo-support')

suite('querycancel', function () {
  this.timeout(30 * 1000)
  const sql = global.native_sql

  let theConnection
  let connStr
  let support
  let async
  let helper
  let procedureHelper

  setup(function (done) {
    supp.GlobalConn.init(sql, function (co) {
      connStr = global.conn_str || co.conn_str
      support = co.support
      procedureHelper = new support.ProcedureHelper(connStr)
      procedureHelper.setVerbose(false)
      async = co.async
      helper = co.helper
      helper.setVerbose(false)
      sql.open(connStr, function (err, newConn) {
        assert(err === false)
        theConnection = newConn
        done()
      })
    }, global.conn_str)
  })

  teardown(function (done) {
    theConnection.close(function (err) {
      assert.ifError(err)
      done()
    })
  })

  test('cancel single query from notifier using tmp connection - expect Operation canceled', function (testDone) {
    const q = sql.query(connStr, sql.PollingQuery('waitfor delay \'00:00:59\';'), function (err) {
      assert(err)
      assert(err.message.indexOf('Operation canceled') > 0)
      testDone()
    })
    q.on('submitted', function () {
      q.cancelQuery(function (err) {
        assert(!err)
      })
    })
  })

  test('cancel single waitfor - expect Operation canceled', function (testDone) {
    const q = theConnection.query(sql.PollingQuery('waitfor delay \'00:00:20\';'), function (err) {
      assert(err)
      assert(err.message.indexOf('Operation canceled') > 0)
      testDone()
    })

    theConnection.cancelQuery(q, function (err) {
      assert(!err)
    })
  })

  test('cancel single waitfor on non polling query - expect cancel error and query to complete', function (testDone) {
    const q = theConnection.query('waitfor delay \'00:00:3\';', function (err) {
      assert(!err)
      testDone()
    })

    theConnection.cancelQuery(q, function (err) {
      assert(err)
      assert(err.message.indexOf('only supported') > 0)
    })
  })

  test('cancel single waitfor using notifier - expect Operation canceled', function (testDone) {
    const q = theConnection.query(sql.PollingQuery('waitfor delay \'00:00:20\';'), function (err) {
      assert(err)
      assert(err.message.indexOf('Operation canceled') > 0)
      testDone()
    })

    q.cancelQuery(function (err) {
      assert(!err)
    })
  })

  test('nested cancel - expect Operation canceled on both', function (testDone) {
    const q1 = theConnection.query(sql.PollingQuery('waitfor delay \'00:00:50\';'), function (err) {
      assert(err.message.indexOf('Operation canceled') > 0)
      const q2 = theConnection.query(sql.PollingQuery('waitfor delay \'00:00:40\';'), function (err) {
        assert(err.message.indexOf('Operation canceled') > 0)
        testDone()
      })

      theConnection.cancelQuery(q2, function (err) {
        assert(!err)
      })
    })

    theConnection.cancelQuery(q1, function (err) {
      assert(!err)
    })
  })

  test('cancel single query - expect Operation canceled', function (testDone) {
    const q = theConnection.query(sql.PollingQuery('waitfor delay \'00:00:20\';'), function (err) {
      assert(err)
      assert(err.message.indexOf('Operation canceled') > 0)
      testDone()
    })

    theConnection.cancelQuery(q, function (err) {
      assert(!err)
    })
  })

  test('2 x cancel - expect Operation canceled on both', function (testDone) {
    let hits = 0

    function hit (err) {
      assert(err)
      assert(err.message.indexOf('Operation canceled') > 0)
      hits++
      if (hits === 2) {
        testDone()
      }
    }

    const q1 = theConnection.query(sql.PollingQuery('waitfor delay \'00:00:20\';'), function (err) {
      hit(err)
    })

    const q2 = theConnection.query(sql.PollingQuery('waitfor delay \'00:00:20\';'), function (err) {
      hit(err)
    })

    theConnection.cancelQuery(q1, function (err) {
      assert(!err)
    })

    theConnection.cancelQuery(q2, function (err) {
      assert(!err)
    })
  })

  test('waitfor delay 20 and delayed cancel- expect Operation canceled', function (testDone) {
    const q = theConnection.query(sql.PollingQuery('waitfor delay \'00:00:20\';'), function (err) {
      assert(err)
      assert(err.message.indexOf('Operation canceled') > 0)
      testDone()
    })

    setTimeout(function () {
      theConnection.cancelQuery(q, function (err) {
        assert(!err)
      })
    }, 100)
  })

  test('cancel single query and cancel again - expect Operation canceled and error', function (testDone) {
    const q = theConnection.query(sql.PollingQuery('waitfor delay \'00:00:20\';'), function (err) {
      assert(err)
      assert(err.message.indexOf('Operation canceled') > 0)
      setImmediate(function () {
        // now try and cancel again
        theConnection.cancelQuery(q, function (err) {
          assert(err)
          assert(err.message.indexOf('cannot cancel query') > 0)
          testDone()
        })
      })
    })

    theConnection.cancelQuery(q, function (err) {
      assert(!err)
    })
  })

  test('cancel single query and submit new query to prove connection still valid', function (testDone) {
    const q = theConnection.query(sql.PollingQuery('waitfor delay \'00:00:20\';'), function (err) {
      assert(err)
      assert(err.message.indexOf('Operation canceled') > 0)
      theConnection.query('SELECT 1 as x', [], function (err, res) {
        assert(!err)
        assert.deepStrictEqual(res, [
          {
            x: 1
          }
        ])
        testDone()
      })
    })

    theConnection.cancelQuery(q, function (err) {
      assert(!err)
    })
  })

  test('cancel a call to proc that waits for delay of input param.', function (testDone) {
    const spName = 'test_spwait_for'

    const def = 'alter PROCEDURE <name>' +
      '(\n' +
      '@timeout datetime' +
      '\n)' +
      'AS\n' +
      'BEGIN\n' +
      'waitfor delay @timeout;' +
      'END\n'

    const fns = [
      function (asyncDone) {
        procedureHelper.createProcedure(spName, def, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        const pm = theConnection.procedureMgr()
        pm.setPolling(true)
        const q = pm.callproc(spName, ['0:0:20'], function (err) {
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
      testDone()
    })
  })

  test('cancel a prepared call that waits', function (testDone) {
    const s = 'waitfor delay ?;'
    let prepared

    const fns = [
      function (asyncDone) {
        theConnection.prepare(sql.PollingQuery(s), function (err, pq) {
          assert(!err)
          prepared = pq
          asyncDone()
        })
      },

      function (asyncDone) {
        const q = prepared.preparedQuery(['00:00:20'], function (err) {
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
      testDone()
    })
  })
})
