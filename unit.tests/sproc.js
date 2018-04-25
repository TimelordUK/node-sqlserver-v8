'use strict'
/* global suite teardown teardown test setup */

var assert = require('assert')
var supp = require('../samples/typescript/demo-support')

suite('sproc', function () {
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
      connStr = global.conn_str || co.conn_str
      support = co.support
      procedureHelper = new support.ProcedureHelper(connStr)
      procedureHelper.setVerbose(false)
      async = co.async
      helper = co.helper
      helper.setVerbose(false)
      sql.open(connStr, function (err, conn) {
        theConnection = conn
        assert(err === false)
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

  test('get proc and call multiple times synchronously with changing params i.e. prove each call is independent', function (testDone) {
    var spName = 'test_sp_get_int_int'

    var def = 'alter PROCEDURE <name>' +
      '(\n' +
      '@num1 INT,\n' +
      '@num2 INT,\n' +
      '@num3 INT OUTPUT\n' +
      '\n)' +
      'AS\n' +
      'BEGIN\n' +
      '   SET @num3 = @num1 + @num2\n' +
      '   RETURN 99;\n' +
      'END\n'

    var fns = [
      function (asyncDone) {
        procedureHelper.createProcedure(spName, def, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        var pm = theConnection.procedureMgr()
        pm.get(spName, function (proc) {
          var count = pm.getCount()
          assert.equal(count, 1)
          var i
          var received = []
          var iterations = 10

          function check () {
            for (i = 0; i < iterations; ++i) {
              var expected = [99, i * 2]
              assert.deepEqual(received[i], expected, 'results didn\'t match')
            }
            asyncDone()
          }

          function next (i) {
            proc.call([i, i], function (err, results, output) {
              assert.ifError(err)
              received[received.length] = output
              if (received.length === iterations) {
                check()
              } else {
                next(i + 1)
              }
            })
          }
          next(0)
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('get proc and call multiple times asynchronously with changing params i.e. prove each call is independent', function (testDone) {
    var spName = 'test_sp_get_int_int'

    var def = 'alter PROCEDURE <name>' +
      '(\n' +
      '@num1 INT,\n' +
      '@num2 INT,\n' +
      '@num3 INT OUTPUT\n' +
      '\n)' +
      'AS\n' +
      'BEGIN\n' +
      '   SET @num3 = @num1 + @num2\n' +
      '   RETURN 99;\n' +
      'END\n'

    var fns = [
      function (asyncDone) {
        procedureHelper.createProcedure(spName, def, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        var pm = theConnection.procedureMgr()
        pm.get(spName, function (procedure) {
          var count = pm.getCount()
          assert.equal(count, 1)
          var i
          var received = []
          var iterations = 1000

          function check () {
            for (i = 0; i < iterations; ++i) {
              var expected = [99, i * 2]
              assert.deepEqual(received[i], expected, 'results didn\'t match')
            }
            asyncDone()
          }

          for (i = 0; i < iterations; ++i) {
            procedure.call([i, i], function (err, results, output) {
              assert.ifError(err)
              received[received.length] = output
              if (received.length === iterations) {
                check()
              }
            })
          }
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('call proc that has 2 output string params + return code', function (testDone) {
    var spName = 'test_sp_get_str_str'

    var def = 'alter PROCEDURE <name>' +
      '(\n' +
      '@id INT,\n' +
      '@name varchar(20) OUTPUT,\n' +
      '@company varchar(20) OUTPUT\n' +
      '\n)' +
      'AS\n' +
      'BEGIN\n' +
      '   SET @name = \'name\'\n' +
      '   SET @company = \'company\'\n' +
      '   RETURN 99;\n' +
      'END\n'

    var fns = [
      function (asyncDone) {
        procedureHelper.createProcedure(spName, def, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        var pm = theConnection.procedureMgr()
        pm.callproc(spName, [1], function (err, results, output) {
          assert.ifError(err)
          var expected = [99, 'name', 'company']
          assert.deepEqual(output, expected, 'results didn\'t match')
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('get proc and call  - should not error', function (testDone) {
    var spName = 'test_sp_get_int_int'

    var def = 'alter PROCEDURE <name>' +
      '(\n' +
      '@num1 INT,\n' +
      '@num2 INT,\n' +
      '@num3 INT OUTPUT\n' +
      '\n)' +
      'AS\n' +
      'BEGIN\n' +
      '   SET @num3 = @num1 + @num2\n' +
      '   RETURN 99;\n' +
      'END\n'

    var fns = [
      function (asyncDone) {
        procedureHelper.createProcedure(spName, def, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        var pm = theConnection.procedureMgr()
        pm.get(spName, function (proc) {
          var count = pm.getCount()
          assert.equal(count, 1)
          proc.call([10, 5], function (err, results, output) {
            var expected = [99, 15]
            assert.ifError(err)
            assert.deepEqual(output, expected, 'results didn\'t match')
            asyncDone()
          })
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('stream call proc no callback', function (testDone) {
    var spName = 'test_len_of_sp'

    var def = 'alter PROCEDURE <name> @param VARCHAR(50) \n' +
      ' AS \n' +
      ' BEGIN \n' +
      '     select LEN(@param) as len; \n' +
      ' END \n'

    var fns = [
      function (asyncDone) {
        procedureHelper.createProcedure(spName, def, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        var pm = theConnection.procedureMgr()
        var rows = []
        pm.get(spName, function (proc) {
          var qp = proc.call(['javascript'])
          qp.on('column', function (c, data) {
            var l = c.toString()
            var r = {}
            r[l] = data
            rows.push(r)
          })

          qp.on('done', function () {
            assert(rows.length === 1)
            var expected = [
              {
                '0': 10
              }
            ]
            assert.deepEqual(expected, rows)
            asyncDone()
          })
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('call proc that waits for delay of input param - wait 2, timeout 5 - should not error', function (testDone) {
    var spName = 'test_spwait_for'

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
        procedureHelper.createProcedure(spName, def, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        var pm = theConnection.procedureMgr()
        pm.setTimeout(5)
        pm.callproc(spName, ['0:0:2'], function (err) {
          assert.ifError(err)
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('call proc that returns length of input string and decribes itself in results', function (testDone) {
    var spName = 'test_sp'

    var def = 'alter PROCEDURE <name> @param VARCHAR(50) \n' +
      ' AS \n' +
      ' BEGIN \n' +
      '     SELECT name, type, type_desc  FROM sys.objects WHERE type = \'P\' AND name = \'<name>\'' +
      '     RETURN LEN(@param); \n' +
      ' END \n'

    var fns = [
      function (asyncDone) {
        procedureHelper.createProcedure(spName, def, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        var pm = theConnection.procedureMgr()
        pm.callproc(spName, ['US of A!'], function (err, results, output) {
          assert.ifError(err)
          var expected = [8]
          assert.deepEqual(output, expected, 'results didn\'t match')
          expected = [
            {
              name: spName,
              type: 'P ',
              type_desc: 'SQL_STORED_PROCEDURE'
            }]
          assert.deepEqual(results, expected, 'results didn\'t match')
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('call proc that returns length of input string', function (testDone) {
    var spName = 'test_sp'

    var def = 'alter PROCEDURE <name> @param VARCHAR(50) \n' +
      ' AS \n' +
      ' BEGIN \n' +
      '     RETURN LEN(@param); \n' +
      ' END \n'

    var fns = [
      function (asyncDone) {
        procedureHelper.createProcedure(spName, def, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        var pm = theConnection.procedureMgr()
        pm.get(spName, function (proc) {
          proc.call(['US of A!'], function (err, results, output) {
            assert.ifError(err)
            var expected = [8]
            assert.deepEqual(output, expected, 'results didn\'t match')
            asyncDone()
          })
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('call proc that has 2 input params + 1 output', function (testDone) {
    var spName = 'test_sp_get_int_int'

    var def = 'alter PROCEDURE <name>' +
      '(\n' +
      '@num1 INT,\n' +
      '@num2 INT,\n' +
      '@num3 INT OUTPUT\n' +
      '\n)' +
      'AS\n' +
      'BEGIN\n' +
      '   SET @num3 = @num1 + @num2\n' +
      '   RETURN 99;\n' +
      'END\n'

    var fns = [
      function (asyncDone) {
        procedureHelper.createProcedure(spName, def, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        var pm = theConnection.procedureMgr()
        pm.callproc(spName, [10, 5], function (err, results, output) {
          assert.ifError(err)
          var expected = [99, 15]
          assert.deepEqual(output, expected, 'results didn\'t match')
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('test asselect on proc', function (testDone) {
    var spName = 'test_sp_get_int_int'

    var def = 'alter PROCEDURE <name>' +
      '(\n' +
      '@num1 INT,\n' +
      '@num2 INT,\n' +
      '@num3 INT OUTPUT\n' +
      '\n)' +
      'AS\n' +
      'BEGIN\n' +
      '   SET @num3 = @num1 + @num2\n' +
      '   RETURN 99;\n' +
      'END\n'

    var fns = [
      function (asyncDone) {
        procedureHelper.createProcedure(spName, def, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        var pm = theConnection.procedureMgr()
        pm.get(spName, function (proc) {
          var meta = proc.getMeta()
          // use an mssql style select
          var s = meta.select
          theConnection.query(s, [10, 5], function (err, results) {
            assert.ifError(err)
            var expected = [{
              num3: 15,
              ___return___: 99
            }]
            assert.deepEqual(results, expected, 'results didn\'t match')
            asyncDone()
          })
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })
})
