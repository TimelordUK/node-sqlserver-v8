// ---------------------------------------------------------------------------------------------------------------------------------
// File: params.js
// Contents: test suite for parameters
//
// Copyright Microsoft Corporation and contributors
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
// --------------------------------------------------------------------------------------------------------------------------------
//

/* global suite teardown teardown test setup */
'use strict'

var assert = require('assert')
var supp = require('../samples/typescript/demo-support')

suite('params', function () {
  var localDate = new Date()
  var utcDate = new Date(Date.UTC(localDate.getUTCFullYear(),
    localDate.getUTCMonth(),
    localDate.getUTCDate(),
    localDate.getUTCHours(),
    localDate.getUTCMinutes(),
    localDate.getUTCSeconds(),
    localDate.getUTCMilliseconds()))

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

  function testBoilerPlate (tableName, tableFields, insertFunction, verifyFunction, doneFunction) {
    var tableFieldsSql = ' (id int identity, '

    for (var field in tableFields) {
      if (tableFields.hasOwnProperty(field)) {
        tableFieldsSql += field + ' ' + tableFields[field] + ','
      }
    }
    tableFieldsSql = tableFieldsSql.substr(0, tableFieldsSql.length - 1)
    tableFieldsSql += ')'

    var sequence = [

      function (asyncDone) {
        var dropQuery = 'DROP TABLE ' + tableName
        theConnection.query(dropQuery, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        var createQuery = 'CREATE TABLE ' + tableName + tableFieldsSql
        theConnection.query(createQuery,
          function (e) {
            assert.ifError(e, 'Error creating table')
            asyncDone()
          })
      },

      function (asyncDone) {
        var clusteredIndexSql = ['CREATE CLUSTERED INDEX IX_', tableName, ' ON ', tableName, ' (id)'].join('')
        theConnection.query(clusteredIndexSql,
          function (e) {
            assert.ifError(e, 'Error creating index')
            asyncDone()
          })
      },

      function (asyncDone) {
        insertFunction(asyncDone)
      },

      function (asyncDone) {
        verifyFunction(function () {
          asyncDone()
        })
      }]

    async.series(sequence,
      function () {
        doneFunction()
      })
  }

  function runTest (columnDef, len, testDone) {
    testBoilerPlate('test_large_insert', {'large_insert': columnDef},
      function (done) {
        var largeText = repeat('A', len)
        theConnection.query('INSERT INTO test_large_insert (large_insert) VALUES (?)', [largeText], function (e) {
          assert.ifError(e, 'Error inserting large string')
          done()
        })
      },

      function (done) {
        theConnection.query('SELECT large_insert FROM test_large_insert', function (e, r) {
          assert.ifError(e)
          assert(r[0].large_insert.length === len, 'Incorrect length for large insert')
          done()
        })
      },
      function () {
        testDone()
      })
  }

  test('select a long string using streaming - ensure no fragmentation', function (testDone) {
    function repeat (a, num) {
      return new Array(num + 1).join(a)
    }
    var longString = repeat('a', 40 * 1024)
    var expected = [
      {
        long_string: longString
      }
    ]
    var res = []
    var colNames = []
    var query = theConnection.query('declare @str nvarchar (MAX);set @str=?;DECLARE @sql NVARCHAR(MAX) = @str; SELECT @str AS long_string', [longString])
    query.on('column', function (c, d) {
      assert(c === 0)
      var obj = {}
      obj[colNames[c]] = d
      res.push(obj)
    })
    query.on('error', function (e) {
      assert(e)
    })
    query.on('meta', function (m) {
      colNames.push(m[0].name)
    })
    query.on('done', function () {
      assert.deepEqual(expected, res)
      testDone()
    })
  })

  test('mssql set @str=?;DECLARE @sql NVARCHAR(MAX) = @str; SELECT @s AS s', function (testDone) {
    var STR_LEN = 2001
    var str = '1'.repeat(STR_LEN)
    //  [sql.WLongVarChar(str)]
    theConnection.query('declare @str nvarchar (MAX);set @str=?;DECLARE @sql NVARCHAR(MAX) = @str; SELECT @str AS data', [str], function (err, res) {
      assert.ifError(err)
      var expected = [{
        data: str
      }]
      assert.deepEqual(expected, res)
      testDone()
    })
  })

  // declare @str nvarchar (MAX);set @str=?;DECLARE @sql NVARCHAR(MAX) = @str; SELECT @s AS s;

  test('insert string 100 in nchar(100)', function (testDone) {
    runTest('nchar(100)', 100, function () {
      testDone()
    })
  })

  test('insert string 500 in nvarchar(1000)', function (testDone) {
    runTest('nvarchar(1000)', 500, function () {
      testDone()
    })
  })

  test('insert string 4 x 1024 in varchar(8000)', function (testDone) {
    runTest('varchar(8000)', 4 * 1024, function () {
      testDone()
    })
  })

  test('insert string 6 x 1024 in varchar(8000)', function (testDone) {
    runTest('varchar(8000)', 6 * 1024, function () {
      testDone()
    })
  })

  test('insert string 30 x 1024 in varchar(max)', function (testDone) {
    runTest('varchar(max)', 30 * 1024, function () {
      testDone()
    })
  })

  test('insert string 2 x 1024 * 1024 in varchar(max)', function (testDone) {
    runTest('varchar(max)', 2 * 1024 * 1024, function () {
      testDone()
    })
  })

  test('insert string 60 x 1024 in varchar(max)', function (testDone) {
    runTest('varchar(max)', 60 * 1024, function () {
      testDone()
    })
  })

  test('verify empty string is sent as empty string, not null', function (testDone) {
    theConnection.query('declare @s NVARCHAR(MAX) = ?; select @s as data', [''], function (err, res) {
      assert.ifError(err)
      var expected = [{
        data: ''
      }]
      assert.deepEqual(expected, res)
      testDone()
    })
  })

  test('verify that non-Buffer object parameter returns an error', function (testDone) {
    var o = {field1: 'value1', field2: -1}
    testBoilerPlate('non_buffer_object',
      {'object_col': 'varbinary(100)'},
      function (asyncDone) {
        theConnection.queryRaw('INSERT INTO non_buffer_object (object_col) VALUES (?)', [o], function (e) {
          var expectedError = new Error('IMNOD: [msnodesql] Parameter 1: Invalid parameter type')
          expectedError.code = -1
          expectedError.sqlstate = 'IMNOD'
          assert.deepEqual(e, expectedError)
          asyncDone()
        })
      },
      function (done) {
        done()
      },
      function () {
        testDone()
      })
  })

  test('verify Buffer objects as input parameters', function (testDone) {
    var b = Buffer.from('0102030405060708090a', 'hex')
    testBoilerPlate(
      'buffer_param_test',
      {'buffer_param': 'varbinary(100)'},

      function (done) {
        theConnection.queryRaw('INSERT INTO buffer_param_test (buffer_param) VALUES (?)', [b], function (e) {
          assert.ifError(e)
          done()
        })
      },

      function (done) {
        theConnection.queryRaw('SELECT buffer_param FROM buffer_param_test WHERE buffer_param = ?', [b], function (e, r) {
          assert.ifError(e)
          assert(r.rows.length = 1)
          assert.deepEqual(r.rows[0][0], b)
          done()
        })
      },
      function () {
        testDone()
      })
  })

  test('insert min and max number values', function (testDone) {
    testBoilerPlate(
      'minmax_test',
      {'f': 'float'},

      function (done) {
        var fns =
          [
            function (asyncDone) {
              theConnection.queryRaw('INSERT INTO minmax_test (f) VALUES (?)', [Number.MAX_VALUE],
                function (e) {
                  assert.ifError(e)
                  asyncDone()
                })
            },

            function (asyncDone) {
              theConnection.queryRaw('INSERT INTO minmax_test (f) VALUES (?)', [-Number.MAX_VALUE],
                function (e) {
                  assert.ifError(e)
                  asyncDone()
                })
            }
          ]

        async.series(fns, function () {
          done()
        })
      },

      function (done) {
        theConnection.queryRaw('SELECT f FROM minmax_test order by id', function (e, r) {
          assert.ifError(e)
          var expected = {
            meta: [
              {name: 'f', size: 53, nullable: true, type: 'number', sqlType: 'float'}],
            rows: [
              [1.7976931348623157e+308],
              [-1.7976931348623157e+308]]
          }
          assert.deepEqual(r, expected, 'minmax results don\'t match')
          done()
        })
      },
      function () {
        testDone()
      })
  })

  test('select a long string using callback', function (testDone) {
    function repeat (a, num) {
      return new Array(num + 1).join(a)
    }
    var longString = repeat('a', 50000)
    var expected = [
      {
        long_string: longString
      }
    ]
    theConnection.query('select ? as long_string', [longString], function (err, res) {
      assert.ifError(err)
      assert.deepEqual(res, expected)
      testDone()
    })
  })

  test('select a long buffer using callback', function (testDone) {
    function repeat (a, num) {
      return new Array(num + 1).join(a)
    }
    var longString = repeat('a', 50000)
    var longBuffer = Buffer.from(longString)
    var expected = [
      {
        long_binary: longBuffer
      }
    ]
    theConnection.query('select ? as long_binary', [longBuffer], function (err, res) {
      assert.ifError(err)
      assert.deepEqual(res, expected)
      testDone()
    })
  })



  test('verify buffer longer than column causes error', function (testDone) {
    var b = Buffer.from('0102030405060708090a', 'hex')
    testBoilerPlate('buffer_param_test', {'buffer_param': 'varbinary(5)'},
      function (done) {
        theConnection.queryRaw('INSERT INTO buffer_param_test (buffer_param) VALUES (?)', [b], function (e) {
          var expectedError = new Error('[Microsoft][SQL Server Native Client 11.0][SQL Server]String or binary data would be truncated.')
          expectedError.sqlstate = '22001'
          expectedError.code = 8152
          assert.deepEqual(e, expectedError)
          done()
        })
      },
      function (done) {
        done()
      },
      function () {
        testDone()
      })
  })

  function repeat (a, num) {
    return new Array(num + 1).join(a)
  }

  test('verify null string is sent as null, not empty string', function (testDone) {
    theConnection.query('declare @s NVARCHAR(MAX) = ?; select @s as data', [null], function (err, res) {
      assert.ifError(err)
      var expected = [{
        data: null
      }]
      assert.deepEqual(expected, res)
      testDone()
    })
  })

  test('verify single char string param', function (testDone) {
    theConnection.query('declare @s NVARCHAR(MAX) = ?; select @s as data', ['p'], function (err, res) {
      assert.ifError(err)
      var expected = [{
        data: 'p'
      }]
      assert.deepEqual(expected, res)
      testDone()
    })
  })

  test('verify bool (true) to sql_variant', function (testDone) {
    theConnection.query('select cast(CAST(\'TRUE\' as bit) as sql_variant) as data;', function (err, res) {
      assert.ifError(err)
      var expected = [{
        data: true
      }]
      assert.deepEqual(expected, res)
      testDone()
    })
  })

  test('verify bool (false) to sql_variant', function (testDone) {
    theConnection.query('select cast(CAST(\'FALSE\' as bit) as sql_variant) as data;', function (err, res) {
      assert.ifError(err)
      var expected = [{
        data: false
      }]
      assert.deepEqual(expected, res)
      testDone()
    })
  })

  test('verify varchar to sql_variant', function (testDone) {
    theConnection.query('select cast(\'hello\' as sql_variant) as data;', function (err, res) {
      assert.ifError(err)
      var expected = [{
        data: 'hello'
      }]
      assert.deepEqual(expected, res)
      testDone()
    })
  })

  test('verify numeric decimal to sql_variant', function (testDone) {
    theConnection.query('select cast(11.77 as sql_variant) as data;', function (err, res) {
      assert.ifError(err)
      var expected = [{
        data: 11.77
      }]
      assert.deepEqual(expected, res)
      testDone()
    })
  })

  test('verify int to sql_variant', function (testDone) {
    theConnection.query('select cast(10000 as sql_variant) as data;', function (err, res) {
      assert.ifError(err)
      var expected = [{
        data: 10000
      }]
      assert.deepEqual(expected, res)
      testDone()
    })
  })

  function toUTC (localDate) {
    return new Date(
      Date.UTC(
        localDate.getUTCFullYear(),
        localDate.getUTCMonth(),
        localDate.getUTCDate(),
        localDate.getUTCHours(),
        0,
        0,
        0))
  }

  test('verify getdate (datetime) to sql_variant', function (testDone) {
    var smalldt = toUTC(new Date())
    theConnection.query('select cast(convert(datetime, ?) as sql_variant) as data', [smalldt], function (err, res) {
      assert.ifError(err)
      var date = res[0].data
      assert(date instanceof Date)
      date = toUTC(date)
      assert(smalldt.getYear() === date.getYear())
      assert(smalldt.getMonth() === date.getMonth())
      assert(smalldt.getDay() === date.getDay())
      testDone()
    })
  })

  test('verify getdate to sql_variant', function (testDone) {
    theConnection.query('select cast(getdate() as sql_variant) as data;', function (err, res) {
      assert.ifError(err)
      var date = res[0].data
      assert(date instanceof Date)
      testDone()
    })
  })

  test('insert null as parameter', function (testDone) {
    testBoilerPlate(
      'null_param_test',
      {'null_test': 'varchar(1)'},
      function (done) {
        theConnection.queryRaw('INSERT INTO null_param_test (null_test) VALUES (?)', [null], function (e) {
          assert.ifError(e)
          done()
        })
      },

      function (done) {
        theConnection.queryRaw('SELECT null_test FROM null_param_test', function (e, r) {
          assert.ifError(e)
          var expected = {
            meta: [{name: 'null_test', size: 1, nullable: true, type: 'text', sqlType: 'varchar'}],
            rows: [[null]]
          }
          assert.deepEqual(expected, r)
          done()
        })
      },
      function () {
        testDone()
      })
  })

  test('invalid numbers cause errors', function (testDone) {
    var sequence = [
      function (asyncDone) {
        theConnection.queryRaw('INSERT INTO invalid_numbers_test (f) VALUES (?)', [Number.POSITIVE_INFINITY], function (e) {
          var expectedError = new Error('IMNOD: [msnodesql] Parameter 1: Invalid number parameter')
          expectedError.code = -1
          expectedError.sqlstate = 'IMNOD'
          assert.deepEqual(e, expectedError)
          asyncDone()
        })
      },

      function (asyncDone) {
        theConnection.queryRaw('INSERT INTO invalid_numbers_test (f) VALUES (?)', [Number.NEGATIVE_INFINITY], function (e) {
          var expectedError = new Error('IMNOD: [msnodesql] Parameter 1: Invalid number parameter')
          expectedError.code = -1
          expectedError.sqlstate = 'IMNOD'

          assert.deepEqual(e, expectedError)
          asyncDone()
        })
      }
    ]

    testBoilerPlate(
      'invalid_numbers_test',
      {'f': 'float'},
      function (done) {
        async.series(sequence, function () {
          done()
        })
      },
      function (done) {
        done()
      },
      function () {
        testDone()
      }
    )
  })

  test('insert string as parameter', function (testDone) {
    testBoilerPlate(
      'string_param_test',
      {'string_test': 'nvarchar(100)'},
      function (done) {
        theConnection.queryRaw('INSERT INTO string_param_test (string_test) VALUES (?)', ['This is a test'], function (e) {
          assert.ifError(e)
          done()
        })
      },

      function (done) {
        theConnection.queryRaw('SELECT string_test FROM string_param_test', function (e, r) {
          assert.ifError(e)
          var expected = {
            meta: [{name: 'string_test', size: 100, nullable: true, type: 'text', sqlType: 'nvarchar'}],
            rows: [['This is a test']]
          }
          assert.deepEqual(expected, r)
          done()
        })
      },
      function () {
        testDone()
      })
  })

  test('insert a bool as a parameter', function (testDone) {
    testBoilerPlate('bool_param_test',
      {'bool_test': 'bit'},

      function (done) {
        theConnection.queryRaw('INSERT INTO bool_param_test (bool_test) VALUES (?)', [true], function (e) {
          assert.ifError(e)
          done()
        })
      },

      function (done) {
        theConnection.queryRaw('SELECT bool_test FROM bool_param_test', function (e, r) {
          assert.ifError(e)
          var expected = {
            meta: [{name: 'bool_test', size: 1, nullable: true, type: 'boolean', sqlType: 'bit'}],
            rows: [[true]]
          }
          assert.deepEqual(expected, r)
          done()
        })
      },

      function () {
        testDone()
      })
  })

  test('insert largest positive int as parameter', function (testDone) {
    testBoilerPlate('int_param_test', {'int_test': 'int'},
      function (done) {
        theConnection.queryRaw('INSERT INTO int_param_test (int_test) VALUES (?)', [0x7fffffff], function (e) {
          assert.ifError(e)
          done()
        })
      },

      function (done) {
        theConnection.queryRaw('SELECT int_test FROM int_param_test', function (e, r) {
          assert.ifError(e)
          var expected = {
            meta: [{name: 'int_test', size: 10, nullable: true, type: 'number', sqlType: 'int'}],
            rows: [[2147483647]]
          }
          assert.deepEqual(expected, r)
          done()
        })
      },
      function () {
        testDone()
      })
  })

  test('insert largest negative int as parameter', function (testDone) {
    testBoilerPlate('int_param_test', {'int_test': 'int'},

      function (done) {
        theConnection.queryRaw('INSERT INTO int_param_test (int_test) VALUES (?)', [-0x80000000], function (e) {
          assert.ifError(e)
          done()
        })
      },

      function (done) {
        theConnection.queryRaw('SELECT int_test FROM int_param_test', function (e, r) {
          assert.ifError(e)
          var expected = {
            meta: [{name: 'int_test', size: 10, nullable: true, type: 'number', sqlType: 'int'}],
            rows: [[-2147483648]]
          }
          assert.deepEqual(expected, r)
          done()
        })
      },
      function () {
        testDone()
      })
  })

  test('insert bigint as parameter', function (testDone) {
    testBoilerPlate('bigint_param_test', {'bigint_test': 'bigint'},
      function (done) {
        theConnection.queryRaw('INSERT INTO bigint_param_test (bigint_test) VALUES (?)', [0x80000000], function (e) {
          assert.ifError(e)
          done()
        })
      },

      function (done) {
        theConnection.queryRaw('SELECT bigint_test FROM bigint_param_test', function (e, r) {
          assert.ifError(e)
          var expected = {
            meta: [{name: 'bigint_test', size: 19, nullable: true, type: 'number', sqlType: 'bigint'}],
            rows: [[0x80000000]]
          }
          assert.deepEqual(expected, r)
          done()
        })
      },

      function () {
        testDone()
      })
  })

  test('insert largest bigint as parameter', function (testDone) {
    testBoilerPlate('bigint_param_test', {'bigint_test': 'bigint'},
      function (done) {
        theConnection.queryRaw('INSERT INTO bigint_param_test (bigint_test) VALUES (?)', [0x4fffffffffffffff], function (e) {
          assert.ifError(e)
          done()
        })
      },

      function (done) {
        theConnection.queryRaw('SELECT bigint_test FROM bigint_param_test', function (e, r) {
          assert.ifError(e)
          var expected = {
            meta: [{name: 'bigint_test', size: 19, nullable: true, type: 'number', sqlType: 'bigint'}],
            rows: [[0x4fffffffffffffff]]
          }
          assert.deepEqual(expected, r)
          done()
        })
      },

      function () {
        testDone()
      })
  })

  test('insert decimal as parameter', function (testDone) {
    testBoilerPlate('decimal_param_test', {'decimal_test': 'decimal(18,7)'},

      function (done) {
        theConnection.queryRaw('INSERT INTO decimal_param_test (decimal_test) VALUES (?)', [3.141593],
          function (e) {
            assert.ifError(e)
            done()
          })
      },

      function (done) {
        theConnection.queryRaw('SELECT decimal_test FROM decimal_param_test', function (e, r) {
          assert.ifError(e)
          var expected = {
            meta: [{
              name: 'decimal_test',
              size: 18,
              nullable: true,
              type: 'number',
              sqlType: 'decimal'
            }],
            rows: [[3.141593]]
          }
          assert.deepEqual(expected, r)
          done()
        })
      },
      function () {
        testDone()
      })
  })

  test('insert decimal as bigint parameter', function (testDone) {
    testBoilerPlate('decimal_as_bigint_param_test', {'decimal_bigint': 'bigint'},
      function (done) {
        theConnection.queryRaw('INSERT INTO decimal_as_bigint_param_test (decimal_bigint) VALUES (?)', [123456789.0],
          function (e) {
            assert.ifError(e)
            done()
          })
      },

      function (done) {
        theConnection.queryRaw('SELECT decimal_bigint FROM decimal_as_bigint_param_test', function (e, r) {
          assert.ifError(e)
          var expected = {
            meta: [{
              name: 'decimal_bigint',
              size: 19,
              nullable: true,
              type: 'number',
              sqlType: 'bigint'
            }],
            rows: [[123456789]]
          }
          assert.deepEqual(expected, r)
          done()
        })
      },

      function () {
        testDone()
      })
  })

  test('insert date as parameter', function (testDone) {
    testBoilerPlate('date_param_test', {'date_test': 'datetimeoffset'},

      function (done) {
        theConnection.queryRaw('INSERT INTO date_param_test (date_test) VALUES (?)', [utcDate],
          function (e) {
            assert.ifError(e)
            done()
          })
      },

      function (done) {
        theConnection.queryRaw('SELECT date_test FROM date_param_test', function (e, r) {
          assert.ifError(e)
          assert.equal(utcDate.toISOString(), r.rows[0][0].toISOString(), 'dates are not equal')
          assert.equal(r.rows[0][0].nanosecondsDelta, 0, 'nanoseconds not 0')
          done()
        })
      },
      function () {
        testDone()
      })
  })

  test('verify js date inserted into datetime field', function (testDone) {
    var localDate = new Date()
    var utcDate = new Date(Date.UTC(localDate.getUTCFullYear(),
      localDate.getUTCMonth(),
      localDate.getUTCDate(),
      localDate.getUTCHours(),
      localDate.getUTCMinutes(),
      localDate.getUTCSeconds(),
      localDate.getUTCMilliseconds()))

    testBoilerPlate('datetime_test', {'datetime_test': 'datetime'},
      function (done) {
        theConnection.queryRaw('INSERT INTO datetime_test (datetime_test) VALUES (?)', [utcDate], function (e, r) {
          assert.ifError(e)
          assert(r.rowcount === 1)
          done()
        })
      },

      function (done) {
        theConnection.queryRaw('SELECT * FROM datetime_test', function (e, r) {
          assert.ifError(e)
          assert(r.rows[0][0], utcDate)
          done()
        })
      },
      function () {
        testDone()
      })
  })

  test('verify empty string inserted into nvarchar field', function (testDone) {
    testBoilerPlate('emptystring_test', {'emptystring_test': 'nvarchar(1)'},
      function (done) {
        theConnection.queryRaw('INSERT INTO emptystring_test (emptystring_test) VALUES (?)', [''], function (e, r) {
          assert.ifError(e)
          assert(r.rowcount === 1)
          done()
        })
      },

      function (done) {
        theConnection.queryRaw('SELECT * FROM emptystring_test', function (e, r) {
          assert.ifError(e)
          assert(r.rows[0][0], '')
          done()
        })
      },

      function () {
        testDone()
      })
  })

  test('insert large string into max column', function (testDone) {
    testBoilerPlate('test_large_insert', {'large_insert': 'nvarchar(max) '},
      function (done) {
        var largeText = repeat('A', 10000)
        theConnection.query('INSERT INTO test_large_insert (large_insert) VALUES (?)', [largeText], function (e) {
          assert.ifError(e, 'Error inserting large string')
          done()
        })
      },

      function (done) {
        theConnection.query('SELECT large_insert FROM test_large_insert', function (e, r) {
          assert.ifError(e)
          assert(r[0].large_insert.length === 10000, 'Incorrect length for large insert')
          done()
        })
      },

      function () {
        testDone()
      })
  })

  test('verify js date inserted into datetime field', function (testDone) {
    var localDate = new Date()
    var utcDate = new Date(Date.UTC(localDate.getUTCFullYear(),
      localDate.getUTCMonth(),
      localDate.getUTCDate(),
      localDate.getUTCHours(),
      localDate.getUTCMinutes(),
      localDate.getUTCSeconds(),
      localDate.getUTCMilliseconds()))

    testBoilerPlate('datetime_test', {'datetime_test': 'datetime'},

      function (done) {
        theConnection.queryRaw('INSERT INTO datetime_test (datetime_test) VALUES (?)', [utcDate], function (e, r) {
          assert.ifError(e)
          assert(r.rowcount === 1)
          done()
        })
      },

      function (done) {
        theConnection.queryRaw('SELECT * FROM datetime_test', function (e, r) {
          assert.ifError(e)
          assert(r.rows[0][0], utcDate)
          done()
        })
      },
      function () {
        testDone()
      })
  })

  test('verify js date before 1970 inserted into datetime field', function (testDone) {
    var ancientDate = new Date(1492, 10, 11, 6, 32, 46, 578)
    var utcDate = new Date(Date.UTC(ancientDate.getUTCFullYear(),
      ancientDate.getUTCMonth(),
      ancientDate.getUTCDate(),
      ancientDate.getUTCHours(),
      ancientDate.getUTCMinutes(),
      ancientDate.getUTCSeconds(),
      ancientDate.getUTCMilliseconds()))

    testBoilerPlate('datetime_test', {'datetime_test': 'datetimeoffset(3)'},

      function (done) {
        theConnection.queryRaw('INSERT INTO datetime_test (datetime_test) VALUES (?)', [utcDate], function (e, r) {
          assert.ifError(e)
          assert(r.rowcount === 1)
          done()
        })
      },

      function (done) {
        theConnection.queryRaw('SELECT datetime_test FROM datetime_test', function (e, r) {
          assert.ifError(e)
          assert.equal(r.rows[0][0].valueOf(), utcDate.valueOf())
          done()
        })
      },
      function () {
        testDone()
      })
  })

  // verify fix for a bug that would return the wrong day when a datetimeoffset was inserted where the date
  // was before 1/1/1970 and the time was midnight.
  test('verify dates with midnight time', function (testDone) {
    var midnightDate = new Date(Date.parse('2030-08-13T00:00:00.000Z'))

    testBoilerPlate('midnight_date_test', {'midnight_date_test': 'datetimeoffset(3)'},
      function (done) {
        var insertQuery = 'INSERT INTO midnight_date_test (midnight_date_test) VALUES (?);'
        theConnection.queryRaw(insertQuery, [midnightDate], function (e) {
          assert.ifError(e)
          done()
        })
      },
      // test valid dates
      function (done) {
        theConnection.queryRaw('SELECT midnight_date_test FROM midnight_date_test', function (e, r) {
          assert.ifError(e)
          var expectedDates = []
          expectedDates.push([midnightDate])
          var expectedResults = {
            meta: [{
              name: 'midnight_date_test',
              size: 30,
              nullable: true,
              type: 'date',
              sqlType: 'datetimeoffset'
            }],
            rows: expectedDates
          }
          assert.deepEqual(expectedResults.meta, r.meta)
          assert(r.rows.length === 1)
          for (var row in r.rows) {
            for (var d in row) {
              assert.deepEqual(expectedResults.rows[row][d], r.rows[row][d])
            }
          }
          done()
        })
      },
      function () {
        testDone()
      })
  })

  test('verify bug fix for last day of the year error', function (testDone) {
    var eoyDate = new Date(Date.parse('1960-12-31T11:12:13.000Z'))

    testBoilerPlate('eoy_date_test', {'eoy_date_test': 'datetimeoffset(3)'},
      function (done) {
        var insertQuery = 'INSERT INTO eoy_date_test (eoy_date_test) VALUES (?);'
        theConnection.queryRaw(insertQuery, [eoyDate], function (e) {
          assert.ifError(e)
          done()
        })
      },

      // test valid dates
      function (done) {
        theConnection.queryRaw('SELECT eoy_date_test FROM eoy_date_test', function (e, r) {
          assert.ifError(e)
          var expectedDates = []
          expectedDates.push([eoyDate])
          var expectedResults = {
            meta: [{
              name: 'eoy_date_test',
              size: 30,
              nullable: true,
              type: 'date',
              sqlType: 'datetimeoffset'
            }],
            rows: expectedDates
          }
          assert.deepEqual(expectedResults.meta, r.meta)
          assert(r.rows.length === 1)
          for (var row in r.rows) {
            for (var d in row) {
              assert.deepEqual(expectedResults.rows[row][d], r.rows[row][d])
            }
          }
          done()
        })
      },
      function () {
        testDone()
      })
  })

  test('bind a null to binary using sqlTypes.asVarBinary(null)', function (testDone) {
    theConnection.query('declare @bin binary(4) = ?; select @bin as bin', [sql.VarBinary(null)], function (err, res) {
      assert.ifError(err)
      var expected = [{
        'bin': null
      }]
      assert.deepEqual(expected, res)
      testDone()
    })
  })

  test('bind a Buffer([0,1,2,3])] to binary', function (testDone) {
    theConnection.query('declare @bin binary(4) = ?; select @bin as bin', [Buffer.from([0, 1, 2, 3])], function (err, res) {
      assert.ifError(err)
      var expected = [{
        'bin': Buffer.from([0, 1, 2, 3])
      }]
      assert.deepEqual(expected, res)
      testDone()
    })
  })
})
