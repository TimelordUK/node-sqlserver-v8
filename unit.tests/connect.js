//  ---------------------------------------------------------------------------------------------------------------------------------
// File: connect.js
// Contents: test suite for connections

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

/* global suite test setup */
'use strict'

var assert = require('assert')
var supp = require('../samples/typescript/demo-support')

suite('open', function () {
  var connStr
  var support
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
      helper = co.helper
      helper.setVerbose(false)
      testDone()
    }, global.conn_str)
  })

  test('connection closes OK in sequence with query', function (done) {
    sql.open(connStr,
      function (err, conn) {
        var expected = [{
          n: 1
        }]
        assert(err === null || err === false)
        conn.query('SELECT 1 as n', function (err, results) {
          assert.ifError(err)
          assert.deepEqual(results, expected)
          conn.close(function () {
            done()
          })
        })
      })
  })

  test('trusted connection to a server', function (done) {
    sql.open(connStr,
      function (err, conn) {
        assert(err === null || err === false)
        assert(typeof conn === 'object')
        conn.close(function () {
          done()
        })
      })
  })

  test('verify closed connection throws an exception', function (done) {
    sql.open(connStr, function (err, conn) {
      assert(err === null || err === false)
      conn.close(function () {
        var thrown = false
        try {
          conn.query('SELECT 1', function (err) {
            assert.ifError(err)
          })
        } catch (e) {
          assert.deepEqual(e, new Error('[msnodesql] Connection is closed.'))
          thrown = true
        }
        assert(thrown)
        done()
      })
    })
  })

  test('verify connection is not closed prematurely until a query is complete', function (done) {
    sql.open(connStr, function (err, conn) {
      assert(err === null || err === false)
      var stmt = conn.queryRaw('select 1')
      stmt.on('meta', function (m) {
      })
      stmt.on('column', function (c, d) {
        assert(c === 0 && d === 1)
      })
      stmt.on('error', function (err) {
        assert(err === null || err === false)
      })
      stmt.on('row', function (r) {
        assert(r === 0)
        conn.close(function () {
          done()
        })
      })
    })
  })

  test('verify that close immediately flag only accepts booleans', function (done) {
    sql.open(connStr, function (err, conn) {
      assert(err === null || err === false)
      var thrown = false
      try {
        conn.close('SELECT 1', function (err) {
          assert(err === null || err === false)
        })
      } catch (e) {
        assert.deepEqual(e, new Error('[msnodesql] Invalid parameters passed to close.'))
        thrown = true
      }
      conn.close(function () {
        assert(thrown)
        done()
      })
    })
  })
})
