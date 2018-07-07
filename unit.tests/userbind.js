/* global suite teardown teardown test setup */
'use strict'

var assert = require('assert')
var supp = require('../samples/typescript/demo-support')

suite('userbind', function () {
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

  function testUserBind (params, cb) {
    var allres = []
    var skip = false
    var error = null

    var sequence = [

      function (asyncDone) {
        theConnection.query(params.query, [params.setter(params.min)], function (err, res) {
          error = err
          if (err) {
            skip = true
            asyncDone()
          } else {
            allres.push(res[0])
            asyncDone()
          }
        })
      },

      function (asyncDone) {
        if (skip) {
          asyncDone()
          return
        }
        theConnection.query(params.query, [params.setter(params.max)], function (err, res) {
          error = err
          if (err) {
            skip = true
            asyncDone()
          } else {
            allres.push(res[0])
            asyncDone()
          }
        })
      },

      function (asyncDone) {
        if (skip) {
          asyncDone()
          return
        }
        if (params.hasOwnProperty('test_null')) {
          if (!params.test_null) {
            asyncDone()
          }
        } else {
          theConnection.query(params.query, [params.setter(null)], function (err, res) {
            error = err
            if (err) {
              error = err
              asyncDone()
            } else {
              allres.push(res[0])
              asyncDone()
            }
          })
        }
      }
    ]

    async.series(sequence,
      function () {
        cb(error, allres)
      })
  }

  function compare (params, res) {
    var min = params.expected ? params.expected[0] : params.min
    var max = params.expected ? params.expected[1] : params.max
    var expected = [
      {v: min},
      {v: max}
    ]

    var testNull = true
    if (params.hasOwnProperty('test_null')) {
      testNull = params.test_null
    }

    if (testNull) {
      expected.push({
        v: null
      })
    }

    assert.deepEqual(res, expected)
  }

  test('user bind DateTime2 to sql type datetime2(7) - with scale set to illegal value, should error', function (testDone) {
    var now = new Date()
    var params = {
      query: 'declare @v DATETIME2(7) = ?; select @v as v',
      min: now,
      max: now,
      setter: function (v) {
        return sql.DateTime2(v, 8) // set scale illegal
      }
    }
    testUserBind(params, function (err) {
      assert(err)
      testDone()
    })
  })

  test('user bind DateTime2 to sql type datetime2(7) - with scale set too low, should error', function (testDone) {
    var jsonDate = '2011-05-26T07:56:00.123Z'
    var then = new Date(jsonDate)
    var params = {
      query: 'declare @v DATETIME2(7) = ?; select @v as v',
      min: then,
      max: then,
      setter: function (v) {
        return sql.DateTime2(v, 1) // set scale too low
      }
    }
    testUserBind(params, function (err) {
      assert.ok(err.message.indexOf('Fractional second precision exceeds the scale specified') > 0)
      testDone()
    })
  })

  function repeat (a, num) {
    return new Array(num + 1).join(a)
  }

  test('user bind WLongVarChar to NVARCHAR(MAX)', function (testDone) {
    var smallLen = 2200
    var largeLen = 8200
    var params = {
      query: 'declare @v NVARCHAR(MAX) = ?; select @v as v',
      min: repeat('N', smallLen),
      max: repeat('X', largeLen),
      test_null: false,
      setter: function (v) {
        return sql.WLongVarChar(v)
      }
    }
    testUserBind(params, function (err, res) {
      assert.ifError(err)
      compare(params, res)
      testDone()
    })
  })

  test('user bind DateTimeOffset to sql type DateTimeOffset - provide offset of 60 minutes', function (testDone) {
    var offset = 60
    var scale = 7
    var now = new Date()
    var smalldt = new Date(Date.UTC(now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      14,
      0,
      0,
      0))

    var expected = new Date(smalldt.getTime() - offset * 60000)

    var params = {
      query: 'declare @v DateTimeOffset = ?; select @v as v',
      min: smalldt,
      max: smalldt,
      expected: [
        expected,
        expected
      ],
      setter: function (v) {
        return sql.DateTimeOffset(v, scale, offset)
      }
    }
    testUserBind(params, function (err, res) {
      assert.ifError(err)
      compare(params, res)
      testDone()
    })
  })

  test('user bind DateTimeOffset to sql type DateTimeOffset - no offset ', function (testDone) {
    var now = new Date()
    var smalldt = new Date(Date.UTC(now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      14,
      0,
      0,
      0))
    var params = {
      query: 'declare @v DateTimeOffset = ?; select @v as v',
      min: smalldt,
      max: smalldt,
      setter: function (v) {
        return sql.DateTimeOffset(v)
      }
    }
    testUserBind(params, function (err, res) {
      assert.ifError(err)
      compare(params, res)
      testDone()
    })
  })

  test('user bind SmallDateTime to sql type smalldatetime', function (testDone) {
    var now = new Date()
    var smalldt = new Date(Date.UTC(now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
      now.getUTCMinutes(),
      0,
      0))
    var params = {
      query: 'declare @v smalldatetime = ?; select @v as v',
      min: smalldt,
      max: smalldt,
      setter: function (v) {
        return sql.SmallDateTime(v)
      }
    }
    testUserBind(params, function (err, res) {
      assert.ifError(err)
      compare(params, res)
      testDone()
    })
  })

  test('user bind DateTime2 to sql type datetime2(7) default scale', function (testDone) {
    var now = new Date()
    var params = {
      query: 'declare @v DATETIME2(7) = ?; select @v as v',
      min: now,
      max: now,
      setter: function (v) {
        return sql.DateTime2(v)
      }
    }
    testUserBind(params, function (err, res) {
      assert.ifError(err)
      compare(params, res)
      testDone()
    })
  })

  test('user bind DateTime2 to sql type datetime2(7) - with scale set correctly, should pass', function (testDone) {
    var now = new Date()
    var params = {
      query: 'declare @v DATETIME2(7) = ?; select @v as v',
      min: now,
      max: now,
      setter: function (v) {
        return sql.DateTime2(v, 3) // set scale just right for ms
      }
    }
    testUserBind(params, function (err, res) {
      assert.ifError(err)
      compare(params, res)
      testDone()
    })
  })

  test('user bind DateTime to sql type datetime2(7)', function (testDone) {
    var now = new Date()
    var params = {
      query: 'declare @v DATETIME2(7) = ?; select @v as v',
      min: now,
      max: now,
      setter: function (v) {
        return sql.DateTime(v)
      }
    }
    testUserBind(params, function (err, res) {
      assert.ifError(err)
      compare(params, res)
      testDone()
    })
  })

  test('user bind DateTime to sql type datetime - driver currently only supports 10ms accuracy with datetime', function (testDone) {
    var now = sql.DateRound()
    var params = {
      query: 'declare @v DATETIME2(7) = ?; select @v as v',
      min: now,
      max: now,
      setter: function (v) {
        return sql.DateTime(v)
      }
    }
    testUserBind(params, function (err, res) {
      assert.ifError(err)
      compare(params, res)
      testDone()
    })
  })

  test('user bind UniqueIdentifier', function (testDone) {
    var params = {
      query: 'declare @v uniqueidentifier = ?; select @v as v',
      min: 'F01251E5-96A3-448D-981E-0F99D789110D',
      max: '45E8F437-670D-4409-93CB-F9424A40D6EE',
      setter: function (v) {
        return sql.UniqueIdentifier(v)
      }
    }
    testUserBind(params, function (err, res) {
      assert.ifError(err)
      compare(params, res)
      testDone()
    })
  })

  test('user bind Time', function (testDone) {
    var today = new Date()
    var timeOnly = new Date(Date.UTC(1900,
      0,
      1,
      today.getUTCHours(),
      today.getUTCMinutes(),
      today.getUTCSeconds(),
      today.getUTCMilliseconds()))
    var params = {
      query: 'declare @v time = ?; select @v as v',
      min: today,
      max: today,
      expected: [
        timeOnly,
        timeOnly
      ],
      setter: function (v) {
        return sql.Time(v)
      }
    }
    testUserBind(params, function (err, res) {
      assert.ifError(err)
      compare(params, res)
      testDone()
    })
  })

  test('user bind Date', function (testDone) {
    var today = new Date()
    var dateOnly = new Date(Date.UTC(today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
      0,
      0,
      0,
      0))
    var params = {
      query: 'declare @v date = ?; select @v as v',
      min: today,
      max: today,
      expected: [
        dateOnly,
        dateOnly
      ],
      setter: function (v) {
        return sql.Date(v)
      }
    }
    testUserBind(params, function (err, res) {
      assert.ifError(err)
      compare(params, res)
      testDone()
    })
  })

  test('user bind Xml - well formatted.', function (testDone) {
    var params = {
      query: 'declare @v xml = ?; select @v as v',
      min: '<Cars><Car id="1234"><Make>Volkswagen</Make><Model>Eurovan</Model><Year>2003</Year><Color>White</Color></Car></Cars>',
      max: '<Cars><Car id="1234"><Make>Volkswagen</Make><Model>Eurovan</Model><Year>2003</Year><Color>White</Color></Car><Car id="5678"><Make>Honda</Make><Model>CRV</Model><Year>2009</Year><Color>Black</Color><Mileage>35,600</Mileage></Car></Cars>',
      setter: function (v) {
        return sql.Xml(v)
      }
    }
    testUserBind(params, function (err, res) {
      assert.ifError(err)
      compare(params, res)
      testDone()
    })
  })

  test('user bind Xml - bad xml should give error', function (testDone) {
    var params = {
      query: 'declare @v xml = ?; select @v as v',
      min: '',
      max: '<Cars><Car id="1234"><Make>Volkswagen</Make><Model>Eurovan</Model><Year>2003</Year><Color>White</Color></Cars>',
      setter: function (v) {
        return sql.Xml(v)
      }
    }
    testUserBind(params, function (err) {
      assert.ok(err.message.indexOf('end tag does not match start tag') > 0)
      testDone()
    })
  })

  test('user bind nchar - check truncated user strings (1)', function (testDone) {
    var params = {
      query: 'declare @v nchar(5) = ?; select @v as v',
      min: 'five',
      max: 'hello world',
      expected: [
        'five ',
        'hello'
      ],

      setter: function (v) {
        return sql.NChar(v)
      }
    }
    testUserBind(params, function (err, res) {
      assert.ifError(err)
      compare(params, res)
      testDone()
    })
  })

  test('user bind Char - check truncated user strings (1)', function (testDone) {
    var params = {
      query: 'declare @v char(5) = ?; select @v as v',
      min: 'five',
      max: 'hello world',
      expected: [
        'five ',
        'hello'
      ],
      setter: function (v) {
        return sql.Char(v)
      }
    }
    testUserBind(params, function (err, res) {
      assert.ifError(err)
      compare(params, res)
      testDone()
    })
  })

  test('user bind Char - returned string will be padded (2)', function (testDone) {
    var params = {
      query: 'declare @v char(5) = ?; select @v as v',
      min: 'h',
      max: 'world',
      expected: [
        'h    ',
        'world'
      ],
      setter: function (v) {
        return sql.Char(v)
      }
    }
    testUserBind(params, function (err, res) {
      assert.ifError(err)
      compare(params, res)
      testDone()
    })
  })

  test('user bind Char - use precision to clip user string (3)', function (testDone) {
    var params = {
      query: 'declare @v char(11) = ?; select @v as v',
      min: 'h',
      max: 'world',
      expected: [
        'h' + new Array(11).join(' '),
        'wo' + new Array(10).join(' ')
      ],
      setter: function (v) {
        return sql.Char(v, 2)
      }
    }
    testUserBind(params, function (err, res) {
      assert.ifError(err)
      compare(params, res)
      testDone()
    })
  })

  test('user bind NVarChar /16 bit encoded', function (testDone) {
    var params = {
      query: 'declare @v varchar(100) = ?; select @v as v',
      min: 'hello',
      max: 'world',
      expected: [
        'hello',
        'world'
      ],
      setter: function (v) {
        return sql.NVarChar(v)
      }
    }
    testUserBind(params, function (err, res) {
      assert.ifError(err)
      compare(params, res)
      testDone()
    })
  })

  test('user bind Float, maps to numeric data structure.', function (testDone) {
    var params = {
      query: 'declare @v float = ?; select @v as v',
      min: -1.7976931348623158E+308,
      max: 1.7976931348623158E+308,
      setter: function (v) {
        return sql.Float(v)
      }
    }
    testUserBind(params, function (err, res) {
      assert.ifError(err)
      compare(params, res)
      testDone()
    })
  })

  test('user bind Double, maps to numeric data structure.', function (testDone) {
    var params = {
      query: 'declare @v float = ?; select @v as v',
      min: -1.7976931348623158E+308,
      max: 1.7976931348623158E+308,
      setter: function (v) {
        return sql.Float(v)
      }
    }
    testUserBind(params, function (err, res) {
      assert.ifError(err)
      compare(params, res)
      testDone()
    })
  })

  test('user bind Bit', function (testDone) {
    var params = {
      query: 'declare @v bit = ?; select @v as v',
      min: false,
      max: true,
      setter: function (v) {
        return sql.Bit(v)
      }
    }
    testUserBind(params, function (err, res) {
      assert.ifError(err)
      compare(params, res)
      testDone()
    })
  })

  test('user bind BigInt', function (testDone) {
    var params = {
      query: 'declare @v bigint = ?; select @v as v',
      min: -9007199254740991,
      max: 9007199254740991,
      setter: function (v) {
        return sql.BigInt(v)
      }
    }
    testUserBind(params, function (err, res) {
      assert.ifError(err)
      compare(params, res)
      testDone()
    })
  })

  test('user bind Int', function (testDone) {
    var params = {
      query: 'declare @v int = ?; select @v as v',
      min: -2147483648,
      max: 2147483647,
      setter: function (v) {
        return sql.Int(v)
      }
    }
    testUserBind(params, function (err, res) {
      assert.ifError(err)
      compare(params, res)
      testDone()
    })
  })

  test('user bind TinyInt', function (testDone) {
    var params = {
      query: 'declare @v tinyint = ?; select @v as v',
      min: 0,
      max: 255,
      setter: function (v) {
        return sql.TinyInt(v)
      }
    }
    testUserBind(params, function (err, res) {
      assert.ifError(err)
      compare(params, res)
      testDone()
    })
  })

  test('user bind SmallInt', function (testDone) {
    var params = {
      query: 'declare @v smallint = ?; select @v as v',
      min: -32768,
      max: 32767,
      setter: function (v) {
        return sql.SmallInt(v)
      }
    }
    testUserBind(params, function (err, res) {
      assert.ifError(err)
      compare(params, res)
      testDone()
    })
  })
})
