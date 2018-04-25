'use strict'
/* global suite teardown teardown test setup */

var supp = require('../samples/typescript/demo-support')
var assert = require('assert')

suite('bulk', function () {
  var theConnection
  this.timeout(100000)
  var tm
  var connStr
  var totalObjectsForInsert = 10
  var test1BatchSize = 1
  var test2BatchSize = 10
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
        assert(err === null || err === false)
        theConnection = newConn
        testDone()
      })
    }, global.conn_str)
  })

  teardown(function (done) {
    theConnection.close(function (err) {
      assert(err === null || err === false || err === undefined)
      done()
    })
  })

  test('employee tmp table complex json object array bulk operations', function (testDone) {
    var tableName = '#Employee'

    var fns = [

      function (asyncDone) {
        helper.dropCreateTable({
          tableName: tableName,
          theConnection: theConnection
        }, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        bindInsert(tableName, function () {
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('bulk insert simple multi-column object - default a nullable column ' + test2BatchSize, function (testDone) {
    function buildTest (count) {
      var arr = []
      var str = '-'
      for (var i = 0; i < count; ++i) {
        str = str + i
        if (i % 10 === 0) str = '-'
        var inst = {
          pkid: i,
          num1: i * 3,
          num2: i * 4,
          // do not present num3 - an array of nulls should be inserted.
          st: str
        }
        arr.push(inst)
      }
      return arr
    }

    var tableName = 'BulkTest'
    var bulkMgr
    var vec = buildTest(totalObjectsForInsert)

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
        tm.bind(tableName, function (bm) {
          bulkMgr = bm
          asyncDone()
        })
      },

      function (asyncDone) {
        bulkMgr.setBatchSize(totalObjectsForInsert)
        bulkMgr.insertRows(vec, function (err, res) {
          assert(err === null || err === false)
          assert(res.length === 0)
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('bulk insert/update/select int column of signed batchSize ' + test2BatchSize, function (testDone) {
    signedTest(test2BatchSize, true, true, function () {
      testDone()
    })
  })

  test('bulk insert/select varbinary column batchSize ' + test1BatchSize, function (testDone) {
    varbinaryTest(test1BatchSize, true, function () {
      testDone()
    })
  })

  test('bulk insert/select varbinary column batchSize ' + test2BatchSize, function (testDone) {
    varbinaryTest(test2BatchSize, true, function () {
      testDone()
    })
  })

  test('bulk insert/select null column of datetime batchSize ' + test2BatchSize, function (testDone) {
    nullTest(test2BatchSize, false, function () {
      testDone()
    })
  })

  test('bulk insert/select null column of datetime batchSize ' + test1BatchSize, function (testDone) {
    nullTest(test1BatchSize, false, function () {
      testDone()
    })
  })

  test('employee complex json object array bulk operations', function (testDone) {
    var tableName = 'Employee'

    var fns = [

      function (asyncDone) {
        helper.dropCreateTable({
          tableName: tableName
        }, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        bindInsert(tableName, function () {
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  function bindInsert (tableName, done) {
    var bulkMgr
    var parsedJSON = helper.getJSON()
    var keys = helper.extractKey(parsedJSON, 'BusinessEntityID')
    var selected

    var fns = [
      function (asyncDone) {
        var tm = theConnection.tableMgr()
        tm.bind(tableName, function (bulk) {
          bulkMgr = bulk
          asyncDone()
        })
      },

      function (asyncDone) {
        bulkMgr.insertRows(parsedJSON, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        bulkMgr.selectRows(keys, function (err, results) {
          assert(err === null || err === false)
          assert(results.length === parsedJSON.length)
          assert.deepEqual(results, parsedJSON, 'results didn\'t match')
          selected = results
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      done(bulkMgr, selected)
    })
  }

  test('employee insert/select with non primary key', function (testDone) {
    var tableName = 'Employee'
    var parsedJSON
    var whereCols = [
      {
        name: 'LoginID'
      }
    ]

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
        bindInsert(tableName, function (bm, selected) {
          bulkMgr = bm
          parsedJSON = selected
          asyncDone()
        })
      },

      function (asyncDone) {
        var keys = helper.extractKey(parsedJSON, 'LoginID')
        bulkMgr.setWhereCols(whereCols)
        bulkMgr.selectRows(keys, function (err, results) {
          assert(err === null || err === false)
          assert(results.length === parsedJSON.length)
          assert.deepEqual(results, parsedJSON, 'results didn\'t match')
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('employee insert - update a single column', function (testDone) {
    var tableName = 'Employee'
    var parsedJSON
    var updateCols = []

    updateCols.push({
      name: 'ModifiedDate'
    })
    var newDate = new Date('2015-01-01T00:00:00.000Z')
    var modifications = []

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
        bindInsert(tableName, function (bm, selected) {
          bulkMgr = bm
          parsedJSON = selected
          asyncDone()
        })
      },

      function (asyncDone) {
        parsedJSON.forEach(function (emp) {
          emp.ModifiedDate = newDate
          modifications.push({
            BusinessEntityID: emp.BusinessEntityID,
            ModifiedDate: newDate
          })
        })
        bulkMgr.setUpdateCols(updateCols)
        bulkMgr.updateRows(modifications, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        var keys = helper.extractKey(parsedJSON, 'BusinessEntityID')
        bulkMgr.selectRows(keys, function (err, results) {
          assert(err === null || err === false)
          assert(results.length === parsedJSON.length)
          assert.deepEqual(results, parsedJSON, 'results didn\'t match')
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  function bitTestStrictColumn (batchSize, selectAfterInsert, runUpdateFunction, testDone) {
    var params = {
      columnType: 'bit',
      columnName: 'Key',
      buildFunction: function (i) {
        return i % 2 === 0
      },
      updateFunction: runUpdateFunction ? function (i) {
        return i % 3 === 0
      } : null,
      check: selectAfterInsert,
      deleteAfterTest: false,
      batchSize: batchSize
    }

    simpleColumnBulkTest(params, function () {
      testDone()
    })
  }

  test('bulk insert/update/select bit strict column ' + test2BatchSize, function (testDone) {
    bitTestStrictColumn(test2BatchSize, true, true, function () {
      testDone()
    })
  })

  test('bulk insert/select bit strict column batchSize ' + test1BatchSize, function (testDone) {
    bitTestStrictColumn(test1BatchSize, true, false, function () {
      testDone()
    })
  })

  test('bulk insert/select bit strict column ' + test2BatchSize, function (testDone) {
    bitTestStrictColumn(test2BatchSize, true, false, function () {
      testDone()
    })
  })

  function nullTest (batchSize, selectAfterInsert, testDone) {
    var params = {
      columnType: 'datetime',
      buildFunction: function () {
        return null
      },
      updateFunction: null,
      check: selectAfterInsert,
      deleteAfterTest: false,
      batchSize: batchSize
    }

    simpleColumnBulkTest(params, function () {
      testDone()
    })
  }

  function dateTest (batchSize, selectAfterInsert, testDone) {
    var dt = new Date('2002-02-06T00:00:00.000Z')

    var params = {
      columnType: 'datetime',
      buildFunction: function () {
        dt.setTime(dt.getTime() + 86400000)
        var nt = new Date()
        nt.setTime(dt.getTime())
        return nt
      },
      updateFunction: null,
      check: selectAfterInsert,
      deleteAfterTest: false,
      batchSize: batchSize
    }

    simpleColumnBulkTest(params, testDone)
  }

  test('bulk insert/select datetime column batchSize ' + test1BatchSize, function (testDone) {
    dateTest(test1BatchSize, true, function () {
      testDone()
    })
  })

  test('bulk insert/select datetime column batchSize ' + test2BatchSize, function (testDone) {
    dateTest(test2BatchSize, true, function () {
      testDone()
    })
  })

  function signedTest (batchSize, selectAfterInsert, runUpdateFunction, testDone) {
    var params = {
      columnType: 'int',
      buildFunction: function (i) {
        return i % 2 === 0 ? -i : i
      },
      updateFunction: runUpdateFunction ? function (i) {
        return i % 2 === 0 ? -i * 3 : i * 3
      } : null,
      check: selectAfterInsert,
      deleteAfterTest: false,
      batchSize: batchSize
    }

    simpleColumnBulkTest(params, function () {
      testDone()
    })
  }

  test('bulk insert/select int column of signed batchSize ' + test1BatchSize, function (testDone) {
    signedTest(test1BatchSize, true, false, function () {
      testDone()
    })
  })

  test('bulk insert/select int column of signed batchSize ' + test2BatchSize, function (testDone) {
    signedTest(test2BatchSize, true, false, function () {
      testDone()
    })
  })

  function unsignedTest (batchSize, selectAfterInsert, runUpdateFunction, testDone) {
    var params = {
      columnType: 'int',
      buildFunction: function (i) {
        return i * 2
      },
      updateFunction: runUpdateFunction ? function (i) {
        return i * 3
      } : null,
      check: selectAfterInsert,
      deleteAfterTest: false,
      batchSize: batchSize
    }

    simpleColumnBulkTest(params, function () {
      testDone()
    })
  }

  test('bulk insert/select int column of unsigned batchSize ' + test1BatchSize, function (testDone) {
    unsignedTest(test1BatchSize, true, false, function () {
      testDone()
    })
  })

  test('bulk insert/select int column of unsigned batchSize ' + test2BatchSize, function (testDone) {
    unsignedTest(test2BatchSize, true, false, function () {
      testDone()
    })
  })

  test('bulk insert/select/update int column of unsigned batchSize ' + test2BatchSize, function (testDone) {
    unsignedTest(test2BatchSize, true, true, function () {
      testDone()
    })
  })

  function bitTest (batchSize, selectAfterInsert, runUpdateFunction, testDone) {
    var params = {
      columnType: 'bit',
      buildFunction: function (i) {
        return i % 2 === 0
      },
      updateFunction: runUpdateFunction ? function (i) {
        return i % 3 === 0
      } : null,
      check: selectAfterInsert,
      deleteAfterTest: false,
      batchSize: batchSize
    }

    simpleColumnBulkTest(params, function () {
      testDone()
    })
  }

  test('bulk insert/select bit column batchSize ' + test1BatchSize, function (testDone) {
    bitTest(test1BatchSize, true, false, function () {
      testDone()
    })
  })

  test('bulk insert/select bit column ' + test2BatchSize, function (testDone) {
    bitTest(test2BatchSize, true, false, function () {
      testDone()
    })
  })

  test('bulk insert/update/select bit column ' + test2BatchSize, function (testDone) {
    bitTest(test2BatchSize, true, true, function () {
      testDone()
    })
  })

  function decimalTest (batchSize, selectAfterInsert, deleteAfterTest, runUpdateFunction, testDone) {
    var params = {
      columnType: 'decimal(18,4)',
      buildFunction: function (i) {
        return (i * 10) + (i * 0.1)
      },
      updateFunction: runUpdateFunction ? function (i) {
        return (i * 1) + (i * 0.2)
      } : null,
      check: selectAfterInsert,
      deleteAfterTest: deleteAfterTest,
      batchSize: batchSize
    }

    simpleColumnBulkTest(params, testDone)
  }

  test('bulk insert/select decimal column batchSize ' + test1BatchSize, function (testDone) {
    decimalTest(test1BatchSize, true, false, false, testDone)
  })

  test('bulk insert/select decimal column batchSize ' + test2BatchSize, function (testDone) {
    decimalTest(test2BatchSize, true, false, false, testDone)
  })

  test('bulk insert/select/delete decimal column batchSize ' + test2BatchSize, function (testDone) {
    decimalTest(test2BatchSize, true, true, false, testDone)
  })

  test('bulk insert/update/select decimal column batchSize ' + test2BatchSize, function (testDone) {
    decimalTest(test2BatchSize, true, false, true, testDone)
  })

  function varcharTest (batchSize, selectAfterInsert, deleteAfterTest, runUpdateFunction, testDone) {
    var arr = []
    var str = ''
    for (var i = 0; i < 10; ++i) {
      str = str + i
      arr.push(str)
    }

    var params = {
      columnType: 'varchar(100)',
      buildFunction: function (i) {
        var idx = i % 10
        return arr[idx]
      },
      updateFunction: runUpdateFunction ? function (i) {
        var idx = 9 - (i % 10)
        return arr[idx]
      } : null,
      check: selectAfterInsert,
      deleteAfterTest: deleteAfterTest,
      batchSize: batchSize
    }

    simpleColumnBulkTest(params, testDone)
  }

  test('bulk insert/select varchar column batchSize ' + test1BatchSize, function (testDone) {
    varcharTest(test1BatchSize, true, false, false, testDone)
  })

  test('bulk insert/select varchar column batchSize ' + test2BatchSize, function (testDone) {
    varcharTest(test2BatchSize, true, false, false, testDone)
  })

  test('bulk insert/select/delete varchar column batchSize ' + test2BatchSize, function (testDone) {
    varcharTest(test2BatchSize, true, true, false, testDone)
  })

  test('bulk insert/update/select varchar column batchSize ' + test2BatchSize, function (testDone) {
    varcharTest(test2BatchSize, true, false, true, testDone)
  })

  test('bulk insert/update/select/delete varchar column batchSize ' + test2BatchSize, function (testDone) {
    varcharTest(test2BatchSize, true, true, true, testDone)
  })

  test('bulk insert simple multi-column object in batches ' + test2BatchSize, function (testDone) {
    function buildTest (count) {
      var arr = []
      var str = '-'
      for (var i = 0; i < count; ++i) {
        str = str + i
        if (i % 10 === 0) str = '-'
        var inst = {
          pkid: i,
          num1: i * 3,
          num2: i * 4,
          num3: i % 2 === 0 ? null : i * 32,
          st: str
        }
        arr.push(inst)
      }
      return arr
    }

    var tableName = 'BulkTest'

    helper.dropCreateTable({
      tableName: tableName
    }, go)

    function go () {
      var tm = theConnection.tableMgr()
      tm.bind(tableName, test)
    }

    function test (bulkMgr) {
      var batch = totalObjectsForInsert
      var vec = buildTest(batch)
      bulkMgr.insertRows(vec, insertDone)

      function insertDone (err, res) {
        assert.ifError(err)
        assert(res.length === 0)
        var s = 'select count(*) as count from ' + tableName
        theConnection.query(s, function (err, results) {
          var expected = [{
            count: batch
          }]
          assert.ifError(err)
          assert.deepEqual(results, expected, 'results didn\'t match')
          testDone()
        })
      }
    }
  })

  function simpleColumnBulkTest (params, completeFn) {
    var type = params.columnType
    var buildFunction = params.buildFunction
    var updateFunction = params.updateFunction
    var check = params.check
    var batchSize = params.batchSize
    var deleteAfterTest = params.deleteAfterTest
    var tableName = 'bulkColumn'
    var columnName = params.columnName || 'col1'

    function buildTestObjects (batch, functionToRun) {
      var arr = []

      for (var i = 0; i < batch; ++i) {
        var o = {
          pkid: i
        }
        o[columnName] = functionToRun(i)
        arr.push(o)
      }
      return arr
    }

    var batch = totalObjectsForInsert
    var toUpdate
    var toInsert = buildTestObjects(batch, buildFunction)
    if (updateFunction) toUpdate = buildTestObjects(batch, updateFunction)
    var skip = false
    var bulkMgr

    var fns = [

      function (asyncDone) {
        helper.dropCreateTable({
          tableName: tableName,
          columnName: columnName,
          type: type
        }, function () {
          asyncDone()
        })
      },

      function (asyncDone) {
        tm = theConnection.tableMgr()
        tm.bind(tableName, function (bm) {
          bulkMgr = bm
          asyncDone()
        })
      },

      function (asyncDone) {
        bulkMgr.setBatchSize(batchSize)
        bulkMgr.insertRows(toInsert, function (err) {
          assert.ifError(err)
          asyncDone()
        })
      },

      function (asyncDone) {
        var s = 'select count(*) as count from ' + tableName
        theConnection.query(s, function (err, results) {
          var expected = [{
            count: batch
          }]
          assert.ifError(err)
          assert.deepEqual(results, expected, 'results didn\'t match')
          asyncDone()
        })
      },

      function (asyncDone) {
        if (!updateFunction) {
          skip = true
          asyncDone()
        } else {
          bulkMgr.updateRows(toUpdate, function (err, res) {
            assert.ifError(err)
            assert(res.length === 0)
            asyncDone()
          })
        }
      },

      function (asyncDone) {
        if (skip) {
          asyncDone()
          return
        }
        if (!check) {
          skip = true
          asyncDone()
          return
        }
        var fetch = []
        for (var i = 0; i < toUpdate.length; ++i) {
          fetch.push({
            pkid: i
          })
        }
        bulkMgr.selectRows(fetch, function (err, results) {
          assert.ifError(err)
          assert.deepEqual(results, toUpdate, 'results didn\'t match')
          asyncDone()
        })
      },

      function (asyncDone) {
        if (skip) {
          asyncDone()
          return
        }
        if (!deleteAfterTest) {
          skip = true
          asyncDone()
          return
        }
        bulkMgr.deleteRows(toInsert, function (err, res) {
          assert.ifError(err)
          assert(res.length === 0)
          asyncDone()
        })
      },

      function (asyncDone) {
        if (skip) {
          asyncDone()
          return
        }
        var s = 'select count(*) as count from ' + tableName
        theConnection.query(s, function (err, results) {
          var expected = [{
            count: 0
          }]
          assert.ifError(err)
          assert.deepEqual(results, expected, 'results didn\'t match')
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      completeFn()
    })
  }

  var arr = []

  function varbinaryTest (batchSize, selectAfterInsert, testDone) {
    var strings = [
      'one',
      'two',
      'three',
      'four',
      'five',
      'six',
      'seven',
      'eight',
      'nine',
      'ten'
    ]

    for (var i = 0; i < 10; ++i) {
      arr.push(Buffer.from(strings[i]))
    }

    var params = {
      columnType: 'varbinary(10)',
      buildFunction: function (i) {
        var idx = i % 10
        return arr[idx]
      },
      updateFunction: null,
      check: selectAfterInsert,
      deleteAfterTest: false,
      batchSize: batchSize
    }

    simpleColumnBulkTest(params, testDone)
  }
})
