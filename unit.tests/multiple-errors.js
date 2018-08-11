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

/* global suite teardown teardown test setup */

'use strict'

var assert = require('assert')
var supp = require('../samples/typescript/demo-support')

suite('multiple errors', function () {
  var connStr
  var theConnection
  var helper

  this.timeout(20000)
  var sql = global.native_sql

  setup(function (testDone) {
    supp.GlobalConn.init(sql, function (co) {
      connStr = global.conn_str || co.conn_str
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
    theConnection.close(function () {
      done()
    })
  })

  test('non trusted invalid user', function (done) {
    var adjusted = connStr.replace('Trusted_Connection=Yes', 'Trusted_Connection=No;Uid=test;Database=test;Pwd=...')
    adjusted = adjusted.replace('Uid=sa', 'Uid=JohnSnow')
    sql.open(adjusted,
      function (err) {
        assert(err)
        assert(err.message.indexOf('Login failed for user') > 0)
        done()
      })
  })

  test('callback multiple errors', function (done) {
    var errors = []
    theConnection.query('select a;select b;', function (err, res, more) {
      if (err) {
        errors.push(err.message)
      }
      if (!more) {
        assert.deepEqual(errors, [
          '[Microsoft][SQL Server Native Client 11.0][SQL Server]Invalid column name \'a\'.',
          '[Microsoft][SQL Server Native Client 11.0][SQL Server]Invalid column name \'b\'.'
        ])
        done()
      }
    })
  })

  test('event based multiple errors', function (done) {
    var errors = []
    var callbacks = 0
    var q = theConnection.query('select a;select b;')
    q.on('error', function (err, more) {
      ++callbacks
      errors.push(err.message)
      if (!more) {
        assert.deepEqual(callbacks, 2)
        assert.deepEqual(errors, [
          '[Microsoft][SQL Server Native Client 11.0][SQL Server]Invalid column name \'a\'.',
          '[Microsoft][SQL Server Native Client 11.0][SQL Server]Invalid column name \'b\'.'
        ])
        done()
      }
    })
  })
})
