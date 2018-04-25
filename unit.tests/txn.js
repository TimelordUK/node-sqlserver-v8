//  ---------------------------------------------------------------------------------------------------------------------------------
// File: txn.js
// Contents: test suite for transactions
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

suite('txn', function () {
  var theConnection
  this.timeout(20000)
  var connStr
  var async
  var helper
  var driver

  var sql = global.native_sql

  setup(function (testDone) {
    supp.GlobalConn.init(sql, function (co) {
      connStr = global.conn_str || co.conn_str
      driver = co.driver
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

  test('setup for tests', function (testDone) {
    // single setup necessary for the test

    var fns = [

      function (asyncDone) {
        try {
          sql.query(connStr, 'drop table test_txn', function () {
            asyncDone()
          })
        } catch (e) {
          asyncDone() // skip any errors because the table might not exist
        }
      },
      function (asyncDone) {
        sql.query(connStr, 'create table test_txn (id int identity, name varchar(100))', function (err) {
          assert.ifError(err)
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.queryRaw('create clustered index index_txn on test_txn (id)', function (err) {
          assert.ifError(err)
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('begin a transaction and rollback with no query', function (done) {
    theConnection.beginTransaction(function (err) {
      assert(err === false)
    })
    theConnection.rollback(function (err) {
      assert(err === false)
      done()
    })
  })

  test('begin a transaction and rollback with no query and no callback', function (done) {
    try {
      theConnection.beginTransaction()
      theConnection.rollback(function (err) {
        assert(err === false)
        done()
      })
    } catch (e) {
      assert(e === false)
    }
  })

  test('begin a transaction and commit', function (testDone) {
    var fns = [

      function (asyncDone) {
        theConnection.beginTransaction(function (err) {
          assert(err === false)
          asyncDone()
        })
      },

      function (asyncDone) {
        theConnection.queryRaw('INSERT INTO test_txn (name) VALUES (\'Anne\')', function (err, results) {
          assert(err === null || err === false)
          assert.deepEqual(results, {meta: null, rowcount: 1}, 'Insert results don\'t match')
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.queryRaw('INSERT INTO test_txn (name) VALUES (\'Bob\')', function (err, results) {
          assert(err === null || err === false)
          assert.deepEqual(results, {meta: null, rowcount: 1}, 'Insert results don\'t match')
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.commit(function (err) {
          assert(err === null || err === false)
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.queryRaw('select * from test_txn', function (err, results) {
          assert(err === null || err === false)

          // verify results
          var expected = {
            'meta': [{
              'name': 'id',
              'size': 10,
              'nullable': false,
              'type': 'number',
              sqlType: 'int identity'
            },
            {'name': 'name', 'size': 100, 'nullable': true, 'type': 'text', sqlType: 'varchar'}],
            'rows': [[1, 'Anne'], [2, 'Bob']]
          }

          assert.deepEqual(results, expected, 'Transaction not committed properly')
          asyncDone()
        })
      }
    ]
    async.series(fns, function () {
      testDone()
    })
  })

  test('begin a transaction and rollback', function (testDone) {
    var fns = [

      function (asyncDone) {
        theConnection.beginTransaction(function (err) {
          assert(err === null || err === false)
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.queryRaw('INSERT INTO test_txn (name) VALUES (\'Carl\')', function (err, results) {
          assert(err === null || err === false)
          assert.deepEqual(results, {meta: null, rowcount: 1}, 'Insert results don\'t match')
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.queryRaw('INSERT INTO test_txn (name) VALUES (\'Dana\')', function (err, results) {
          assert(err === null || err === false)
          assert.deepEqual(results, {meta: null, rowcount: 1}, 'Insert results don\'t match')
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.rollback(function (err) {
          assert(err === null || err === false)
          asyncDone()
        })
      },
      function (asyncDone) {
        theConnection.queryRaw('select * from test_txn', function (err, results) {
          assert(err === null || err === false)

          // verify results
          var expected = {
            'meta': [{
              'name': 'id',
              'size': 10,
              'nullable': false,
              'type': 'number',
              sqlType: 'int identity'
            },
            {'name': 'name', 'size': 100, 'nullable': true, 'type': 'text', sqlType: 'varchar'}],
            'rows': [[1, 'Anne'], [2, 'Bob']]
          }

          assert.deepEqual(results, expected, 'Transaction not rolled back properly')
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('begin a transaction and then query with an error', function (testDone) {
    var fns = [
      function (asyncDone) {
        theConnection.beginTransaction(function (err) {
          assert(err === null || err === false)
          asyncDone()
        })
      },

      function (asyncDone) {
        var q = theConnection.queryRaw('INSERT INTO test_txn (name) VALUES (\'Carl\')\'m with STUPID')
        // events are emitted before callbacks are called currently
        q.on('error', function (err) {
          var expected = new Error('[Microsoft][' + driver + '][SQL Server]Unclosed quotation mark after the character string \'m with STUPID\'.')
          expected.sqlstate = '42000'
          expected.code = 105

          assert.deepEqual(err, expected, 'Transaction should have caused an error')

          theConnection.rollback(function (err) {
            assert(err === null || err === false)
            asyncDone()
          })
        })
      },

      function (asyncDone) {
        theConnection.queryRaw('select * from test_txn', function (err, results) {
          assert(err === null || err === false)

          // verify results
          var expected = {
            'meta': [{
              'name': 'id',
              'size': 10,
              'nullable': false,
              'type': 'number',
              sqlType: 'int identity'
            },
            {'name': 'name', 'size': 100, 'nullable': true, 'type': 'text', sqlType: 'varchar'}],
            'rows': [[1, 'Anne'], [2, 'Bob']]
          }

          assert.deepEqual(results, expected, 'Transaction not rolled back properly')
          asyncDone()
        })
      }
    ]

    async.series(fns, function () {
      testDone()
    })
  })

  test('begin a transaction and commit (with no async support)', function (testDone) {
    theConnection.beginTransaction(function (err) {
      assert(err === null || err === false)
    })

    theConnection.queryRaw('INSERT INTO test_txn (name) VALUES (\'Anne\')', function (err) {
      assert(err === null || err === false)
    })

    theConnection.queryRaw('INSERT INTO test_txn (name) VALUES (\'Bob\')', function (err) {
      assert(err === null || err === false)
    })

    theConnection.commit(function (err) {
      assert(err === null || err === false)
    })

    theConnection.queryRaw('select * from test_txn', function (err, results) {
      assert(err === null || err === false)

      // verify results
      var expected = {
        'meta': [
          {'name': 'id', 'size': 10, 'nullable': false, 'type': 'number', sqlType: 'int identity'},
          {'name': 'name', 'size': 100, 'nullable': true, 'type': 'text', sqlType: 'varchar'}
        ],
        'rows': [
          [1, 'Anne'], [2, 'Bob'], [5, 'Anne'], [6, 'Bob']
        ]
      }

      assert.deepEqual(results, expected, 'Transaction not committed properly')

      testDone()
    })
  })
})
