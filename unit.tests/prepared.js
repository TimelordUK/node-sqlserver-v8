//  ---------------------------------------------------------------------------------------------------------------------------------
// File: prepared.js
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

var supp = require('../samples/typescript/demo-support')
var assert = require('assert')

function empSelectSQL () {
  return 'SELECT [BusinessEntityID] ' +
     ',[NationalIDNumber] ' +
     ',[LoginID] ' +
     ',[OrganizationNode] ' +
     ',[OrganizationLevel] ' +
     ',[JobTitle] ' +
     ',[BirthDate] ' +
     ',[MaritalStatus] ' +
     ',[Gender] ' +
     ',[HireDate] ' +
     ',[SalariedFlag] ' +
     ',[VacationHours] ' +
     ',[SickLeaveHours] ' +
     ',[CurrentFlag] ' +
     ',[rowguid] ' +
     ',[ModifiedDate] ' +
     'FROM [dbo].[Employee] ' +
     ' WHERE BusinessEntityID = ? '
}

function empDeleteSQL () {
  return 'DELETE FROM [dbo].[Employee] ' +
        'WHERE BusinessEntityID = ?'
}

function empNoParamsSQL () {
  return 'SELECT [BusinessEntityID] ' +
     ',[NationalIDNumber] ' +
     ',[LoginID] ' +
     ',[OrganizationNode] ' +
     ',[OrganizationLevel] ' +
     ',[JobTitle] ' +
     ',[BirthDate] ' +
     ',[MaritalStatus] ' +
     ',[Gender] ' +
     ',[HireDate] ' +
     ',[SalariedFlag] ' +
     ',[VacationHours] ' +
     ',[SickLeaveHours] ' +
     ',[CurrentFlag] ' +
     ',[rowguid] ' +
     ',[ModifiedDate] ' +
     'FROM [dbo].[Employee]'
}

suite('prepared', function () {
  var connStr
  var theConnection
  var support
  var async
  var helper
  var procedureHelper
  var prepared
  var parsedJSON
  var sql = global.native_sql
  this.timeout(10000)

  var actions = [
    // open a connection.
    function (asyncDone) {
      sql.open(connStr, function (err, newConn) {
        assert(err === null || err === false)
        theConnection = newConn
        asyncDone()
      })
    },

    // drop / create an Employee table.
    function (asyncDone) {
      helper.dropCreateTable({
        tableName: tableName
      }, function () {
        asyncDone()
      })
    },

    // insert test set using bulk insert
    function (asyncDone) {
      var tm = theConnection.tableMgr()
      tm.bind(tableName, function (bulkMgr) {
        bulkMgr.insertRows(parsedJSON, function () {
          asyncDone()
        })
      })
    },

    // prepare a select statement.
    function (asyncDone) {
      employeePrepare(empSelectSQL(), function (ps) {
        prepared.select = ps
        asyncDone()
      })
    },

    // prepare a select all statement.
    function (asyncDone) {
      employeePrepare(empNoParamsSQL(), function (ps) {
        prepared.scan = ps
        asyncDone()
      })
    },

    // prepare a delete statement.
    function (asyncDone) {
      employeePrepare(empDeleteSQL(), function (ps) {
        prepared.delete = ps
        asyncDone()
      })
    }
  ]

  var tableName = 'Employee'

  setup(function (testDone) {
    prepared = {
      select: null,
      delete: null,
      scan: null
    }

    supp.GlobalConn.init(sql, function (co) {
      connStr = global.conn_str || co.conn_str
      support = co.support
      procedureHelper = new support.ProcedureHelper(connStr)
      procedureHelper.setVerbose(false)
      async = co.async
      helper = co.helper
      helper.setVerbose(false)
      parsedJSON = helper.getJSON()
      async.series(actions,
        function () {
          testDone()
        })
    }, global.conn_str)
  })

  teardown(function (done) {
    var fns = [
      function (asyncDone) {
        prepared.select.free(function () {
          asyncDone()
        })
      },
      function (asyncDone) {
        prepared.delete.free(function () {
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.close(function (err) {
          assert.ifError(err)
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      done()
    })
  })

  function employeePrepare (query, done) {
    theConnection.prepare(query, function (err, ps) {
      assert(err === null || err === false)
      done(ps)
    })
  }

  test('use prepared to reserve and read multiple rows.', function (testDone) {
    var sql = 'select * from master..syscomments'
    theConnection.prepare(sql, function (err, preparedQuery) {
      assert(err === null || err === false)
      preparedQuery.preparedQuery([], function (err, res) {
        assert(res != null)
        assert(res.length > 0)
        assert.ifError(err)
      })
      preparedQuery.free(function () {
        testDone()
      })
    })
  })

  test('use prepared statement twice with no parameters.', function (testDone) {
    var select = prepared.scan
    var meta = select.getMeta()
    assert(meta.length > 0)
    select.preparedQuery(function (err, res1) {
      assert.ifError(err)
      assert.deepEqual(parsedJSON, res1, 'results didn\'t match')
      select.preparedQuery(function (err, res2) {
        assert.ifError(err)
        assert.deepEqual(parsedJSON, res2, 'results didn\'t match')
        testDone()
      })
    })
  })

  test('use prepared statements to select a row, then delete it over each row.', function (testDone) {
    var select = prepared.select
    var meta = select.getMeta()
    assert(meta.length > 0)
    var remove = prepared.delete
    var max = parsedJSON[parsedJSON.length - 1].BusinessEntityID
    var businessId = 1
    next(businessId, iterate)

    function iterate () {
      businessId++
      if (businessId > max) check()
      else next(businessId, iterate)
    }

    function check () {
      theConnection.query('select count(*) as rows from Employee', function (err, res) {
        assert.ifError(err)
        assert(res[0].rows === 0)
        testDone()
      })
    }

    function next (businessId, done) {
      select.preparedQuery([businessId], function (err, res1) {
        assert.ifError(err)
        var fetched = parsedJSON[businessId - 1]
        assert.deepEqual(fetched, res1[0], 'results didn\'t match')
        remove.preparedQuery([businessId], function (err) {
          assert.ifError(err)
          done()
        })
      })
    }
  })

  test('stress test prepared statement with 500 invocations cycling through primary key', function (testDone) {
    var select = prepared.select
    var meta = select.getMeta()
    assert(meta.length > 0)
    var businessId = 1
    var iteration = 0
    var totalIterations = 500
    var max = parsedJSON[parsedJSON.length - 1].BusinessEntityID
    next(businessId, iterate)

    function iterate () {
      businessId++
      if (businessId > max) businessId = 1
      ++iteration
      if (iteration < totalIterations) {
        next(businessId, iterate)
      } else {
        testDone()
      }
    }

    function next (businessId, done) {
      select.preparedQuery([businessId],
        function (err, res1) {
          assert.ifError(err)
          assert(res1[0].BusinessEntityID === businessId)
          done()
        })
    }
  })

  test('use prepared statement twice with different params.', function (testDone) {
    var select = prepared.select
    var meta = select.getMeta()
    var id1 = 2
    var id2 = 3
    assert(meta.length > 0)
    select.preparedQuery([id1], function (err, res1) {
      assert.ifError(err)
      select.preparedQuery([id2], function (err, res2) {
        assert.ifError(err)
        var o1 = parsedJSON[id1 - 1]
        assert.deepEqual(o1, res1[0], 'results didn\'t match')

        var o2 = parsedJSON[id2 - 1]
        assert.deepEqual(o2, res2[0], 'results didn\'t match')
        testDone()
      })
    })
  })
})
