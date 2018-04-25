/* global suite teardown teardown test setup */
'use strict'

var assert = require('assert')
var supp = require('../samples/typescript/demo-support')

suite('concurrent', function () {
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
    theConnection.close(function () {
      done()
    })
  })

  var open = function (done) {
    sql.open(connStr, function (err, conn) {
      assert.ifError(err)
      done(conn)
    })
  }

  test('check for blocked calls to api with event emission', function (testDone) {
    var delays = []
    var start = Date.now()
    var expected = ['a', 'b', 'c', 'd']
    var seq = []

    function test () {
      assert.deepEqual(expected, seq)
      testDone()
    }

    function pushTest (c) {
      seq.push(c)
      delays.push(Date.now() - start)
      if (seq.length === expected.length) {
        test()
      }
    }

    var req = theConnection.query('waitfor delay \'00:00:02\';')
    req.on('done', function () {
      pushTest('a')
      process.nextTick(function () {
        pushTest('b')
      })
      setImmediate(function () {
        pushTest('d')
      })
      process.nextTick(function () {
        pushTest('c')
      })
    })
  })

  test('open connections in sequence and prove distinct connection objects created', function (testDone) {
    var connections = []

    open(function (conn1) {
      connections.push(conn1)
      open(function (conn2) {
        connections.push(conn2)
        open(function (conn3) {
          connections.push(conn3)
          done()
        })
      })
    })

    function done () {
      var c0 = connections[0]
      var c1 = connections[1]
      var c2 = connections[2]

      var t1 = c0 === c1 && c1 === c2
      assert(t1 === false)
      assert(c0.id !== c1.id)
      assert(c1.id !== c2.id)

      var clean = [
        function (asyncDone) {
          c0.close(function () {
            asyncDone()
          })
        },
        function (asyncDone) {
          c1.close(function () {
            asyncDone()
          })
        },
        function (asyncDone) {
          c2.close(function () {
            asyncDone()
          })
        }
      ]

      async.series(clean, function () {
        testDone()
      })
    }
  })

  test('check for blocked calls to api', function (testDone) {
    var seq = []
    var delays = []
    var start = Date.now()
    var expected = ['a', 'b', 'c', 'd', 'e']

    function pushTest (c) {
      seq.push(c)
      delays.push(Date.now() - start)
      if (seq.length === expected.length) {
        assert.deepEqual(expected, seq)
        testDone()
      }
    }

    pushTest('a')
    process.nextTick(function () {
      pushTest('c')
    })

    theConnection.query('waitfor delay \'00:00:02\';', function () {
      pushTest('e')
    })

    pushTest('b')
    process.nextTick(function () {
      pushTest('d')
    })
  })

  test('check for blocked calls to api with nested query', function (testDone) {
    var seq = []
    var delays = []
    var start = Date.now()
    var expected = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']

    function pushTest (c) {
      seq.push(c)
      delays.push(Date.now() - start)
      if (seq.length === expected.length) {
        assert.deepEqual(expected, seq)
        testDone()
      }
    }

    pushTest('a')
    process.nextTick(function () {
      pushTest('c')
    })
    theConnection.query('waitfor delay \'00:00:02\';', [], function () {
      pushTest('e')
      pushTest('f')
      process.nextTick(function () {
        pushTest('h')
      })
      theConnection.query('waitfor delay \'00:00:02\';', [], function () {
        pushTest('j')
      })
      pushTest('g')
      process.nextTick(function () {
        pushTest('i')
      })
    })
    pushTest('b')
    process.nextTick(function () {
      pushTest('d')
    })
  })

  test('open connections simultaneously and prove distinct connection objects created', function (testDone) {
    var connections = []

    open(function (conn1) {
      connections.push(conn1)
      if (connections.length === 3) done()
    })

    open(function (conn2) {
      connections.push(conn2)
      if (connections.length === 3) done()
    })

    open(function (conn3) {
      connections.push(conn3)
      if (connections.length === 3) done()
    })

    function done () {
      var c0 = connections[0]
      var c1 = connections[1]
      var c2 = connections[2]

      var t1 = c0 === c1 && c1 === c2
      assert(t1 === false)
      assert(c0.id !== c1.id)
      assert(c1.id !== c2.id)

      var clean = [
        function (asyncDone) {
          c0.close(function () {
            asyncDone()
          })
        },
        function (asyncDone) {
          c1.close(function () {
            asyncDone()
          })
        },
        function (asyncDone) {
          c2.close(function () {
            asyncDone()
          })
        }
      ]

      async.series(clean, function () {
        testDone()
      })
    }
  })

  test('make sure two concurrent connections each have unique spid ', function (testDone) {
    var spid1
    var spid2

    open(function (c1) {
      open(function (c2) {
        c1.query('select @@SPID as id, CURRENT_USER as name', function (err, res) {
          assert.ifError(err)
          assert(res.length === 1)
          spid1 = res[0]['id']
          assert(spid1 !== null)

          c2.query('select @@SPID as id, CURRENT_USER as name', function (err, res) {
            assert.ifError(err)
            assert(res.length === 1)
            spid2 = res[0]['id']
            assert(spid2 !== null)
            assert(spid1 !== spid2)

            var clean = [

              function (asyncDone) {
                c1.close(function () {
                  asyncDone()
                })
              },
              function (asyncDone) {
                c2.close(function () {
                  asyncDone()
                })
              }
            ]

            async.series(clean, function () {
              testDone()
            })
          })
        })
      })
    })
  })
})
