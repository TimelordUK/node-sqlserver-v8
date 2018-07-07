//  ---------------------------------------------------------------------------------------------------------------------------------
// File: query.js
// Contents: test suite for queries
//
// Copyright Microsoft Corporation
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
//
// You may obtain a copy of the License at:
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//  ---------------------------------------------------------------------------------------------------------------------------------

/* global suite teardown teardown test setup */

'use strict'

var assert = require('assert')
var supp = require('../samples/typescript/demo-support')

suite('query', function () {
  var connStr
  var theConnection
  var async
  var helper
  var driver
  // var database

  this.timeout(20000)
  var sql = global.native_sql

  setup(function (testDone) {
    supp.GlobalConn.init(sql, function (co) {
      connStr = global.conn_str || co.conn_str
      async = co.async
      helper = co.helper
      driver = co.driver
      // database = co.database
      helper.setVerbose(false)
      sql.open(connStr, function (err, conn) {
        theConnection = conn
        assert(err === false)
        testDone()
      })
    }, global.conn_str)
  })

  teardown(function (done) {
    theConnection.close(function () {
      done()
    })
  })

  test('verify empty results retrieved properly', function (testDone) {
    var fns = [
      function (asyncDone) {
        theConnection.queryRaw('drop table test_sql_no_data', function () {
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.queryRaw('create table test_sql_no_data (id int identity, name varchar(20))', function (err) {
          assert.ifError(err)
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.queryRaw('create clustered index index_nodata on test_sql_no_data (id)', function (err) {
          assert.ifError(err)
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.queryRaw('delete from test_sql_no_data where 1=0', function (err, results) {
          assert.ifError(err)
          var expectedResults = {meta: null, rowcount: 0}
          assert.deepEqual(results, expectedResults)
          asyncDone()
        })
      }
    ]
    async.series(fns, function () {
      testDone()
    })
  })

  test('object_name query ', function (done) {
    theConnection.query('select object_name(c.object_id), (select dc.definition from sys.default_constraints as dc where dc.object_id = c.default_object_id) as DefaultValueExpression from sys.columns as c', function (err, results) {
      assert.ifError(err)
      assert(results.length > 0)
      done()
    })
  })

  test('select nulls union all nulls', function (done) {
    var nullObj = {
      testdate: null,
      testint: null,
      testchar: null,
      testbit: null,
      testdecimal: null,
      testbinary: null,
      testtime: null
    }
    var expected = [nullObj, nullObj, nullObj]
    theConnection.query('select cast(null as datetime) as testdate, cast(null as int) as testint, cast(null as varchar(max)) as testchar, cast(null as bit) as testbit, cast(null as decimal) as testdecimal, cast(null as varbinary) as testbinary, cast(null as time) as testtime\n' +
      'union all\n' +
      'select cast(null as datetime) as testdate, cast(null as int) as testint, cast(null as varchar(max)) as testchar, cast(null as bit) as testbit, cast(null as decimal) as testdecimal, cast(null as varbinary) as testbinary, cast(null as time) as testtime\n' +
      'union all\n' +
      'select cast(null as datetime) as testdate, cast(null as int) as testint, cast(null as varchar(max)) as testchar, cast(null as bit) as testbit, cast(null as decimal) as testdecimal, cast(null as varbinary) as testbinary, cast(null as time) as testtime', function (err, results) {
      assert.ifError(err)
      assert(results.length === 3)
      assert.deepEqual(results, expected)
      done()
    })
  })

  test('test function parameter validation', function (testDone) {
    // test the module level open, query and queryRaw functions
    var thrown
    var fns =
      [
        function (asyncDone) {
          thrown = false
          try {
            sql.query(connStr, function () {
              return 5
            })
          } catch (e) {
            thrown = true
            assert.equal(e.toString(), 'Error: [msnodesql] Invalid query string passed to function query. Type should be string.', 'Improper error returned')
          }
          assert(thrown === true)
          asyncDone()
        },

        function (asyncDone) {
          thrown = false
          try {
            sql.queryRaw(connStr, ['This', 'is', 'a', 'test'])
          } catch (e) {
            thrown = true
            assert.equal(e.toString(), 'Error: [msnodesql] Invalid query string passed to function queryRaw. Type should be string.', 'Improper error returned')
          }
          assert(thrown === true)
          asyncDone()
        },

        function (asyncDone) {
          thrown = false
          try {
            sql.queryRaw(['This', 'is', 'a', 'test'], 'SELECT 1')
          } catch (e) {
            thrown = true
            assert.equal(e.toString(), 'Error: [msnodesql] Invalid connection string passed to function queryRaw. Type should be string.', 'Improper error returned')
          }
          assert(thrown === true)
          asyncDone()
        },

        function (asyncDone) {
          thrown = false
          // test the module level open, query and queryRaw functions
          try {
            sql.open(connStr, 5)
          } catch (e) {
            thrown = true
            assert.equal(e.toString(), 'Error: [msnodesql] Invalid callback passed to function open. Type should be function.', 'Improper error returned')
          }
          assert(thrown = true)
          asyncDone()
        },

        function (asyncDone) {
          var thrown = false
          try {
            sql.open(1, 'SELECT 1')
          } catch (e) {
            thrown = true
            assert.equal(e.toString(), 'Error: [msnodesql] Invalid connection string passed to function open. Type should be string.', 'Improper error returned')
          }
          assert(thrown === true)
          asyncDone()
        },

        function (asyncDone) {
          thrown = false
          try {
            sql.query(function () {
              return 1
            }, 'SELECT 1')
          } catch (e) {
            thrown = true
            assert.equal(e.toString(), 'Error: [msnodesql] Invalid connection string passed to function query. Type should be string.', 'Improper error returned')
          }
          assert(thrown = true)
          asyncDone()
        },

        function (asyncDone) {
          sql.queryRaw(connStr, 'SELECT 1', function (e) {
            assert.ifError(e)
            asyncDone()
          })
        },

        function (asyncDone) {
          sql.queryRaw(connStr, 'SELECT 1', [], function (e) {
            assert.ifError(e)
            asyncDone()
          })
        },

        function (asyncDone) {
          sql.queryRaw(connStr, 'SELECT 1', null, function (e) {
            assert.ifError(e)
            asyncDone()
          })
        },

        function (asyncDone) {
          var stmt = sql.queryRaw(connStr, 'SELECT 1', [])
          stmt.on('error', function (e) {
            assert.ifError(e)
          })
          stmt.on('closed', function () {
            asyncDone()
          })
        },

        function (asyncDone) {
          var stmt = sql.queryRaw(connStr, 'SELECT 1', null)
          stmt.on('error', function (e) {
            assert.ifError(e)
          })
          stmt.on('closed', function () {
            asyncDone()
          })
        },

        function (asyncDone) {
          var thrown = false
          try {
            sql.queryRaw(connStr, 'SELECT 1', 1)
          } catch (e) {
            thrown = true
            assert.equal(e.toString(), 'Error: [msnodesql] Invalid parameter(s) passed to function query or queryRaw.', 'Improper error returned')
          }
          assert(thrown === true)
          asyncDone()
        },

        function (asyncDone) {
          var thrown = false
          try {
            sql.queryRaw(connStr, 'SELECT 1', {a: 1, b: '2'}, function (a) {
            })
          } catch (e) {
            thrown = true
            assert.equal(e.toString(), 'Error: [msnodesql] Invalid parameter(s) passed to function query or queryRaw.', 'Improper error returned')
          }
          assert(thrown === true)
          asyncDone()
        },

        function (asyncDone) {
          var thrown = false
          try {
            theConnection.query(1)
          } catch (e) {
            thrown = true
            assert.equal(e.toString(), 'Error: [msnodesql] Invalid query string passed to function query. Type should be string.', 'Improper error returned')
          }
          assert(thrown === true)
          asyncDone()
        },

        function (asyncDone) {
          var thrown = false
          try {
            theConnection.queryRaw(function () {
              return 1
            })
          } catch (e) {
            thrown = true
            assert.equal(e.toString(), 'Error: [msnodesql] Invalid query string passed to function queryRaw. Type should be string.', 'Improper error returned')
          }
          assert(thrown === true)
          asyncDone()
        }
      ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('test retrieving a LOB string larger than max string size', function (testDone) {
    var stmt = theConnection.query('SELECT REPLICATE(CAST(\'B\' AS varchar(max)), 20000) AS \'LOB String\'')
    var len = 0
    stmt.on('column', function (c, d, m) {
      assert(c === 0)
      if (d) {
        len = d.length
      }
    })
    stmt.on('done', function () {
      assert(len === 20000)
      testDone()
    })
    stmt.on('error', function (e) {
      assert.ifError(e)
    })
  })

  test('query with errors', function (done) {
    var expectedError = new Error('[Microsoft][' + driver + '][SQL Server]Unclosed quotation mark after the character string \'m with NOBODY\'.')
    expectedError.sqlstate = '42000'
    expectedError.code = 105
    var fns = [
      function (asyncDone) {
        assert.doesNotThrow(function () {
          theConnection.queryRaw('I\'m with NOBODY', function (e) {
            assert(e instanceof Error)
            assert.deepEqual(e, expectedError, 'Unexpected error returned')
            asyncDone()
          })
        })
      },

      function (asyncDone) {
        assert.doesNotThrow(function () {
          var s = theConnection.queryRaw('I\'m with NOBODY')
          s.on('error', function (e) {
            assert(e instanceof Error)
            assert.deepEqual(e, expectedError, 'Unexpected error returned')
            asyncDone()
          })
        })
      }
    ]

    async.series(fns, function () {
      done()
    })
  })

  test('simple query', function (done) {
    theConnection.query('SELECT 1 as X, \'ABC\', 0x0123456789abcdef ', function (err, results) {
      assert.ifError(err)
      var buffer = Buffer.from('0123456789abcdef', 'hex')
      var expected = [{'X': 1, 'Column1': 'ABC', 'Column2': buffer}]
      assert.deepEqual(results, expected, 'Results don\'t match')
      done()
    })
  })

  test('simple rawFormat query', function (done) {
    theConnection.queryRaw('SELECT 1 as X, \'ABC\', 0x0123456789abcdef ', function (err, results) {
      assert.ifError(err)
      var buffer = Buffer.from('0123456789abcdef', 'hex')
      var expected = {
        meta: [{name: 'X', size: 10, nullable: false, type: 'number', sqlType: 'int'},
          {name: '', size: 3, nullable: false, type: 'text', sqlType: 'varchar'},
          {name: '', size: 8, nullable: false, type: 'binary', sqlType: 'varbinary'}],
        rows: [[1, 'ABC', buffer]]
      }
      assert.deepEqual(results, expected, 'rawFormat results didn\'t match')
      done()
    })
  })

  test('simple query of types like var%', function (done) {
    var like = 'var%'
    theConnection.query('SELECT name FROM sys.types WHERE name LIKE ?', [like], function (err, results) {
      assert.ifError(err)
      for (var row = 0; row < results.length; ++row) {
        assert(results[row].name.substr(0, 3) === 'var')
      }
      done()
    })
  })

  test('streaming test', function (done) {
    var like = 'var%'
    var currentRow = 0
    var metaExpected = [{name: 'name', size: 128, nullable: false, type: 'text', sqlType: 'nvarchar'}]

    var stmt = theConnection.query('select name FROM sys.types WHERE name LIKE ?', [like])

    stmt.on('meta', function (meta) {
      assert.deepEqual(meta, metaExpected)
    })
    stmt.on('row', function (idx) {
      assert(idx === currentRow)
      ++currentRow
    })
    stmt.on('column', function (idx, data) {
      assert(data.substr(0, 3) === 'var')
    })
    stmt.on('done', function () {
      done()
    })
    stmt.on('error', function (err) {
      assert.ifError(err)
    })
  })

  test('serialized queries', function (done) {
    var expected = [
      {
        meta: [{name: '', size: 10, nullable: false, type: 'number', sqlType: 'int'}],
        rows: [[1]]
      },
      {
        meta: [{name: '', size: 10, nullable: false, type: 'number', sqlType: 'int'}],
        rows: [[2]]
      },
      {
        meta: [{name: '', size: 10, nullable: false, type: 'number', sqlType: 'int'}],
        rows: [[3]]
      },
      {
        meta: [{name: '', size: 10, nullable: false, type: 'number', sqlType: 'int'}],
        rows: [[4]]
      },
      {
        meta: [{name: '', size: 10, nullable: false, type: 'number', sqlType: 'int'}],
        rows: [[5]]
      }
    ]

    var results = []

    theConnection.queryRaw('SELECT 1', function (e, r) {
      assert.ifError(e)
      results.push(r)
    })

    theConnection.queryRaw('SELECT 2', function (e, r) {
      assert.ifError(e)
      results.push(r)
    })

    theConnection.queryRaw('SELECT 3', function (e, r) {
      assert.ifError(e)
      results.push(r)
    })

    theConnection.queryRaw('SELECT 4', function (e, r) {
      assert.ifError(e)
      results.push(r)
    })

    theConnection.queryRaw('SELECT 5', function (e, r) {
      assert.ifError(e)
      results.push(r)
      assert.deepEqual(expected, results)
      done()
    })
  })

  test('query with errors', function (done) {
    var expectedError = new Error('[Microsoft][' + driver + '][SQL Server]Unclosed quotation mark after the character string \'m with NOBODY\'.')
    expectedError.sqlstate = '42000'
    expectedError.code = 105

    var fns = [

      function (asyncDone) {
        assert.doesNotThrow(function () {
          theConnection.queryRaw('I\'m with NOBODY', function (e) {
            assert(e instanceof Error)
            assert.deepEqual(e, expectedError, 'Unexpected error returned')
            asyncDone()
          })
        })
      },

      function (asyncDone) {
        assert.doesNotThrow(function () {
          var s = theConnection.queryRaw('I\'m with NOBODY')
          s.on('error', function (e) {
            assert(e instanceof Error)
            assert.deepEqual(e, expectedError, 'Unexpected error returned')
            asyncDone()
          })
        })
      }
    ]

    async.series(fns, function () {
      done()
    })
  })

  test('multiple results from query in callback', function (done) {
    var moreShouldBe = true
    var called = 0
    var buffer
    var expected

    theConnection.queryRaw('SELECT 1 as X, \'ABC\', 0x0123456789abcdef; SELECT 2 AS Y, \'DEF\', 0xfedcba9876543210',
      function (err, results, more) {
        assert.ifError(err)
        assert.equal(more, moreShouldBe)
        ++called

        if (more) {
          buffer = Buffer.from('0123456789abcdef', 'hex')
          expected = {
            meta: [{name: 'X', size: 10, nullable: false, type: 'number', sqlType: 'int'},
              {name: '', size: 3, nullable: false, type: 'text', sqlType: 'varchar'},
              {name: '', size: 8, nullable: false, type: 'binary', sqlType: 'varbinary'}],
            rows: [[1, 'ABC', buffer]]
          }

          assert.deepEqual(results, expected, 'Result 1 does not match expected')

          assert(called === 1)
          moreShouldBe = false
        } else {
          buffer = Buffer.from('fedcba9876543210', 'hex')
          expected = {
            meta: [{name: 'Y', size: 10, nullable: false, type: 'number', sqlType: 'int'},
              {name: '', size: 3, nullable: false, type: 'text', sqlType: 'varchar'},
              {name: '', size: 8, nullable: false, type: 'binary', sqlType: 'varbinary'}],
            rows: [[2, 'DEF', buffer]]
          }

          assert.deepEqual(results, expected, 'Result 2 does not match expected')
          assert(called === 2)
          done()
        }
      })
  })

  test('multiple results from query in events', function (done) {
    var r = theConnection.queryRaw('SELECT 1 as X, \'ABC\', 0x0123456789abcdef; SELECT 2 AS Y, \'DEF\', 0xfedcba9876543210')

    var expected = [
      [{name: 'X', size: 10, nullable: false, type: 'number', sqlType: 'int'},
        {name: '', size: 3, nullable: false, type: 'text', sqlType: 'varchar'},
        {name: '', size: 8, nullable: false, type: 'binary', sqlType: 'varbinary'}],
      {row: 0},
      {column: 0, data: 1, more: false},
      {column: 1, data: 'ABC', more: false},
      {
        column: 2,
        data: Buffer.from('0123456789abcdef', 'hex'),
        more: false
      },
      [
        {name: 'Y', size: 10, nullable: false, type: 'number', sqlType: 'int'},
        {name: '', size: 3, nullable: false, type: 'text', sqlType: 'varchar'},
        {name: '', size: 8, nullable: false, type: 'binary', sqlType: 'varbinary'}
      ],
      {row: 1},
      {column: 0, data: 2, more: false},
      {column: 1, data: 'DEF', more: false},
      {
        column: 2,
        data: Buffer.from('fedcba9876543210', 'hex'),
        more: false
      }
    ]
    var received = []

    r.on('meta', function (m) {
      received.push(m)
    })
    r.on('row', function (idx) {
      received.push({row: idx})
    })
    r.on('column', function (idx, data, more) {
      received.push({column: idx, data: data, more: more})
    })
    r.on('done', function () {
      assert.deepEqual(received, expected)
      done()
    })
    r.on('error', function (e) {
      assert.ifError(e)
    })
  })

  test('boolean return value from query', function (done) {
    theConnection.queryRaw('SELECT CONVERT(bit, 1) AS bit_true, CONVERT(bit, 0) AS bit_false',
      function (err, results) {
        assert.ifError(err)
        var expected = {
          meta: [{name: 'bit_true', size: 1, nullable: true, type: 'boolean', sqlType: 'bit'},
            {name: 'bit_false', size: 1, nullable: true, type: 'boolean', sqlType: 'bit'}],
          rows: [[true, false]]
        }
        assert.deepEqual(results, expected, 'Results didn\'t match')
        done()
      })
  })



  test('test retrieving a string with null embedded', function (testDone) {
    var embeddedNull = String.fromCharCode(65, 66, 67, 68, 0, 69, 70)

    var fns = [
      function (asyncDone) {
        theConnection.queryRaw('DROP TABLE null_in_string_test', function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        theConnection.queryRaw('CREATE TABLE null_in_string_test (id int IDENTITY, null_in_string varchar(100) NOT NULL)',
          function (e) {
            assert.ifError(e)
            asyncDone()
          })
      },
      function (asyncDone) {
        theConnection.queryRaw('CREATE CLUSTERED INDEX ix_null_in_string_test ON null_in_string_Test (id)', function (err) {
          assert.ifError(err)
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.queryRaw('INSERT INTO null_in_string_test (null_in_string) VALUES (?)', [embeddedNull],
          function (e) {
            assert.ifError(e)
            asyncDone()
          })
      },

      function (asyncDone) {
        theConnection.queryRaw('SELECT null_in_string FROM null_in_string_test', function (e, r) {
          assert.ifError(e)
          assert(r.rows[0][0] === embeddedNull)
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('test retrieving a non-LOB string of max size', function (testDone) {
    function repeat (c, num) {
      return new Array(num + 1).join(c)
    }

    theConnection.query('SELECT REPLICATE(\'A\', 8000) AS \'NONLOB String\'', function (e, r) {
      assert.ifError(e)
      assert(r[0]['NONLOB String'] === repeat('A', 8000))
      testDone()
    })
  })

  test('test retrieving an empty string', function (testDone) {
    theConnection.query('SELECT \'\' AS \'Empty String\'', function (e, r) {
      assert.ifError(e)
      assert(r[0]['Empty String'] === '')
      testDone()
    })
  })

  /*
  test('test login failure', function (done) {
    // construct a connection string that will fail due to
    // the database not existing
    var badConnection = connStr.replace('Database={' + database + '}', 'Database={DNE}')

    sql.query(badConnection, 'SELECT 1 as X', function (err) {
      // verify we get the expected error when the login fails
      assert.ok(err.message.indexOf('Login failed for user') > 0)
      assert.equal(err.sqlstate, 28000)
      done()
    })
  })
  */

  test('test function parameter validation', function (testDone) {
    var thrown = false

    var fns = [
      function (asyncDone) {
        // test the module level open, query and queryRaw functions
        try {
          sql.open(1, 'SELECT 1')
        } catch (e) {
          thrown = true
          assert.equal(e.toString(), 'Error: [msnodesql] Invalid connection string passed to function open. Type should be string.', 'Improper error returned')
        }
        assert(thrown === true)
        asyncDone()
      },

      function (asyncDone) {
        thrown = false
        try {
          sql.query(function () {
            return 1
          }, 'SELECT 1')
        } catch (e) {
          thrown = true
          assert.equal(e.toString(), 'Error: [msnodesql] Invalid connection string passed to function query. Type should be string.', 'Improper error returned')
        }
        assert(thrown = true)
        asyncDone()
      },

      function (asyncDone) {
        thrown = false
        try {
          sql.queryRaw(['This', 'is', 'a', 'test'], 'SELECT 1')
        } catch (e) {
          thrown = true
          assert.equal(e.toString(), 'Error: [msnodesql] Invalid connection string passed to function queryRaw. Type should be string.', 'Improper error returned')
        }
        assert(thrown === true)
        asyncDone()
      },

      function (asyncDone) {
        thrown = false
        // test the module level open, query and queryRaw functions
        try {
          sql.open(connStr, 5)
        } catch (e) {
          thrown = true
          assert.equal(e.toString(), 'Error: [msnodesql] Invalid callback passed to function open. Type should be function.', 'Improper error returned')
        }
        assert(thrown = true)
        asyncDone()
      },

      function (asyncDone) {
        thrown = false
        try {
          sql.query(connStr, function () {
            return 5
          })
        } catch (e) {
          thrown = true
          assert.equal(e.toString(), 'Error: [msnodesql] Invalid query string passed to function query. Type should be string.', 'Improper error returned')
        }
        assert(thrown === true)
        asyncDone()
      },

      function (asyncDone) {
        thrown = false
        try {
          sql.queryRaw(connStr, ['This', 'is', 'a', 'test'])
        } catch (e) {
          thrown = true
          assert.equal(e.toString(), 'Error: [msnodesql] Invalid query string passed to function queryRaw. Type should be string.', 'Improper error returned')
        }
        assert(thrown === true)
        asyncDone()
      },

      function (asyncDone) {
        var stmt = sql.queryRaw(connStr, 'SELECT 1')
        stmt.on('error', function (e) {
          assert.ifError(e)
        })
        stmt.on('closed', function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        sql.queryRaw(connStr, 'SELECT 1', function (e) {
          assert.ifError(e)
          asyncDone()
        })
      },

      function (asyncDone) {
        sql.queryRaw(connStr, 'SELECT 1', [], function (e) {
          assert.ifError(e)
          asyncDone()
        })
      },

      function (asyncDone) {
        sql.queryRaw(connStr, 'SELECT 1', null, function (e) {
          assert.ifError(e)
          asyncDone()
        })
      },

      function (asyncDone) {
        var stmt = sql.queryRaw(connStr, 'SELECT 1', [])
        stmt.on('error', function (e) {
          assert.ifError(e)
        })
        stmt.on('closed', function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        var stmt = sql.queryRaw(connStr, 'SELECT 1', null)
        stmt.on('error', function (e) {
          assert.ifError(e)
        })
        stmt.on('closed', function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        thrown = false
        try {
          sql.queryRaw(connStr, 'SELECT 1', 1)
        } catch (e) {
          thrown = true
          assert.equal(e.toString(), 'Error: [msnodesql] Invalid parameter(s) passed to function query or queryRaw.', 'Improper error returned')
        }
        assert(thrown === true)
        asyncDone()
      },

      function (asyncDone) {
        thrown = false
        try {
          sql.queryRaw(connStr, 'SELECT 1', {a: 1, b: '2'}, function (a) {
          })
        } catch (e) {
          thrown = true
          assert.equal(e.toString(), 'Error: [msnodesql] Invalid parameter(s) passed to function query or queryRaw.', 'Improper error returned')
        }
        assert(thrown === true)
        asyncDone()
      },

      function (asyncDone) {
        thrown = false
        try {
          theConnection.query(1)
        } catch (e) {
          thrown = true
          assert.equal(e.toString(), 'Error: [msnodesql] Invalid query string passed to function query. Type should be string.', 'Improper error returned')
        }
        assert(thrown === true)
        asyncDone()
      },

      function (asyncDone) {
        thrown = false
        try {
          theConnection.queryRaw(function () {
            return 1
          })
        } catch (e) {
          thrown = true
          assert.equal(e.toString(), 'Error: [msnodesql] Invalid query string passed to function queryRaw. Type should be string.', 'Improper error returned')
          asyncDone()
        }
        assert(thrown === true)
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('verify metadata is retrieved for udt/geography types', function (testDone) {
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
        theConnection.query('INSERT INTO spatial_test (GeogCol1) VALUES (geography::STGeomFromText(\'LINESTRING(-122.360 47.656, -122.343 47.656 )\', 4326))',
          function (e) {
            assert.ifError(e)
            asyncDone()
          })
      },
      function (asyncDone) {
        theConnection.query('INSERT INTO spatial_test (GeogCol1) VALUES (geography::STGeomFromText(\'POLYGON((-122.358 47.653 , -122.348 47.649, -122.348 47.658, -122.358 47.658, -122.358 47.653))\', 4326))', function (e) {
          assert.ifError(e)
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.queryRaw('SELECT GeogCol1 FROM spatial_test', function (e, r) {
          assert.ifError(e)
          var expectedResults = {
            meta: [{
              name: 'GeogCol1',
              size: 0,
              nullable: true,
              type: 'binary',
              sqlType: 'udt',
              udtType: 'geography'
            }],
            rows: [[Buffer.from('e610000001148716d9cef7d34740d7a3703d0a975ec08716d9cef7d34740cba145b6f3955ec0', 'hex')],
              [Buffer.from('e6100000010405000000dd24068195d34740f4fdd478e9965ec0508d976e12d3474083c0caa145965ec04e62105839d4474083c0caa145965ec04e62105839d44740f4fdd478e9965ec0dd24068195d34740f4fdd478e9965ec001000000020000000001000000ffffffff0000000003', 'hex')]
            ]
          }
          assert.deepEqual(r, expectedResults, 'udt results don\'t match')
          asyncDone()
        })
      }
    ]
    async.series(fns, function () {
      testDone()
    })
  })
})
