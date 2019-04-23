'use strict'
/* global suite teardown teardown test setup */

const assert = require('assert')
const supp = require('../samples/typescript/demo-support')

suite('sproc', function () {
  let connStr
  let theConnection
  let support
  let async
  let helper
  let procedureHelper
  const sql = global.native_sql

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
    const spName = 'test_sp_get_int_int'

    const def = 'alter PROCEDURE <name>' +
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

    const fns = [
      function (asyncDone) {
        procedureHelper.createProcedure(spName, def, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        const pm = theConnection.procedureMgr()
        pm.get(spName, function (proc) {
          const count = pm.getCount()
          assert.strictEqual(count, 1)
          let i
          const received = []
          const iterations = 10

          function check () {
            for (i = 0; i < iterations; ++i) {
              const expected = [99, i * 2]
              assert.deepStrictEqual(received[i], expected, 'results didn\'t match')
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
    const spName = 'test_sp_get_int_int'

    const def = 'alter PROCEDURE <name>' +
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

    const fns = [
      function (asyncDone) {
        procedureHelper.createProcedure(spName, def, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        const pm = theConnection.procedureMgr()
        pm.get(spName, function (procedure) {
          const count = pm.getCount()
          assert.strictEqual(count, 1)
          const received = []
          const iterations = 1000

          function check () {
            for (let i = 0; i < iterations; ++i) {
              const expected = [99, i * 2]
              assert.deepStrictEqual(received[i], expected, 'results didn\'t match')
            }
            asyncDone()
          }

          for (let i = 0; i < iterations; ++i) {
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
    const spName = 'test_sp_get_str_str'

    const def = 'alter PROCEDURE <name>' +
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

    const fns = [
      function (asyncDone) {
        procedureHelper.createProcedure(spName, def, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        const pm = theConnection.procedureMgr()
        pm.callproc(spName, [1], function (err, results, output) {
          assert.ifError(err)
          const expected = [99, 'name', 'company']
          assert.deepStrictEqual(output, expected, 'results didn\'t match')
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('get proc and call  - should not error', function (testDone) {
    const spName = 'test_sp_get_int_int'

    const def = 'alter PROCEDURE <name>' +
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

    const fns = [
      function (asyncDone) {
        procedureHelper.createProcedure(spName, def, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        const pm = theConnection.procedureMgr()
        pm.get(spName, function (proc) {
          const count = pm.getCount()
          assert.strictEqual(count, 1)
          proc.call([10, 5], function (err, results, output) {
            const expected = [99, 15]
            assert.ifError(err)
            assert.deepStrictEqual(output, expected, 'results didn\'t match')
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
    const spName = 'test_len_of_sp'

    const def = 'alter PROCEDURE <name> @param VARCHAR(50) \n' +
      ' AS \n' +
      ' BEGIN \n' +
      '     select LEN(@param) as len; \n' +
      ' END \n'

    const fns = [
      function (asyncDone) {
        procedureHelper.createProcedure(spName, def, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        const pm = theConnection.procedureMgr()
        const rows = []
        pm.get(spName, function (proc) {
          const qp = proc.call(['javascript'])
          qp.on('column', function (c, data) {
            const l = c.toString()
            const r = {}
            r[l] = data
            rows.push(r)
          })

          qp.on('done', function () {
            assert(rows.length === 1)
            const expected = [
              {
                '0': 10
              }
            ]
            assert.deepStrictEqual(expected, rows)
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
    const spName = 'test_sp'

    const def = 'alter PROCEDURE <name> @param VARCHAR(50) \n' +
      ' AS \n' +
      ' BEGIN \n' +
      '     SELECT name, type, type_desc  FROM sys.objects WHERE type = \'P\' AND name = \'<name>\'' +
      '     RETURN LEN(@param); \n' +
      ' END \n'

    const fns = [
      function (asyncDone) {
        procedureHelper.createProcedure(spName, def, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        const pm = theConnection.procedureMgr()
        pm.callproc(spName, ['US of A!'], function (err, results, output) {
          assert.ifError(err)
          let expected = [8]
          assert.deepStrictEqual(output, expected, 'results didn\'t match')
          expected = [
            {
              name: spName,
              type: 'P ',
              type_desc: 'SQL_STORED_PROCEDURE'
            }]
          assert.deepStrictEqual(results, expected, 'results didn\'t match')
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('call proc that returns length of input string', function (testDone) {
    const spName = 'test_sp'

    const def = 'alter PROCEDURE <name> @param VARCHAR(50) \n' +
      ' AS \n' +
      ' BEGIN \n' +
      '     RETURN LEN(@param); \n' +
      ' END \n'

    const fns = [
      function (asyncDone) {
        procedureHelper.createProcedure(spName, def, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        const pm = theConnection.procedureMgr()
        pm.get(spName, function (proc) {
          proc.call(['US of A!'], function (err, results, output) {
            assert.ifError(err)
            const expected = [8]
            assert.deepStrictEqual(output, expected, 'results didn\'t match')
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
    const spName = 'test_sp_get_int_int'

    const def = 'alter PROCEDURE <name>' +
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

    const fns = [
      function (asyncDone) {
        procedureHelper.createProcedure(spName, def, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        const pm = theConnection.procedureMgr()
        pm.callproc(spName, [10, 5], function (err, results, output) {
          assert.ifError(err)
          const expected = [99, 15]
          assert.deepStrictEqual(output, expected, 'results didn\'t match')
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('test asselect on proc', function (testDone) {
    const spName = 'test_sp_get_int_int'

    const def = 'alter PROCEDURE <name>' +
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

    const fns = [
      function (asyncDone) {
        procedureHelper.createProcedure(spName, def, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        const pm = theConnection.procedureMgr()
        pm.get(spName, function (proc) {
          const meta = proc.getMeta()
          // use an mssql style select
          const s = meta.select
          theConnection.query(s, [10, 5], function (err, results) {
            assert.ifError(err)
            const expected = [{
              num3: 15,
              ___return___: 99
            }]
            assert.deepStrictEqual(results, expected, 'results didn\'t match')
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
