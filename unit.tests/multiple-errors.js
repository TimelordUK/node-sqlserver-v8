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

const assert = require('assert')
const supp = require('../samples/typescript/demo-support')

suite('multiple errors', function () {
  let connStr
  let theConnection
  let helper

  this.timeout(20000)
  const sql = global.native_sql

  setup(testDone => {
    supp.GlobalConn.init(sql, co => {
      connStr = global.conn_str || co.conn_str
      helper = co.helper
      helper.setVerbose(false)
      sql.open(connStr, (err, conn) => {
        theConnection = conn
        assert(err === false)
        testDone()
      })
    }, global.conn_str)
  })

  teardown(done => {
    theConnection.close(() => {
      done()
    })
  })

  test('select then use print statement capture print', done => {
    const q = theConnection.query('select 1 as one; print \'hello world!\'')
    const errors = []
    const info = []
    const rows = []
    let currentRow = []
    let metadata = null
    let lastColumn = 0

    const expectedInfo = [
      {
        sqlstate: '01000',
        code: 0,
        message: '[Microsoft][SQL Server Native Client 11.0][SQL Server]hello world!'
      }
    ]
    q.on('error', e => {
      errors.push(e)
    })

    q.on('info', m => {
      info.push({
        sqlstate: m.sqlstate,
        code: m.code,
        message: m.message
      })
    })

    q.on('done', () => {
      assert.deepStrictEqual(expectedInfo, info)
      assert(errors.length === 0)
      assert.deepStrictEqual(1, rows.length)
      assert.deepStrictEqual(rows, [
        [
          1
        ]
      ])
      done()
    })

    q.on('meta', (meta) => {
      metadata = meta
      currentRow = [metadata.length]
      lastColumn = metadata.length - 1
    })

    q.on('column', (index, data) => {
      currentRow[index] = data
      if (index === lastColumn) {
        rows.push(currentRow)
        currentRow = [metadata.length]
      }
    })
  })

  test('use print statement capture print', done => {
    const q = theConnection.query('print \'hello world!\'; select 1 as one')
    const errors = []
    const info = []
    const rows = []
    let currentRow = []
    let metadata = null
    let lastColumn = 0

    const expectedInfo = [
      {
        sqlstate: '01000',
        code: 0,
        message: '[Microsoft][SQL Server Native Client 11.0][SQL Server]hello world!'
      }
    ]
    q.on('error', e => {
      errors.push(e)
    })

    q.on('info', m => {
      info.push({
        sqlstate: m.sqlstate,
        code: m.code,
        message: m.message
      })
    })

    q.on('done', () => {
      assert.deepStrictEqual(expectedInfo, info)
      assert(errors.length === 0)
      assert.deepStrictEqual(1, rows.length)
      assert.deepStrictEqual(rows, [
        [
          1
        ]
      ])
      done()
    })

    q.on('meta', (meta) => {
      metadata = meta
      currentRow = [metadata.length]
      lastColumn = metadata.length - 1
    })

    q.on('column', (index, data) => {
      currentRow[index] = data
      if (index === lastColumn) {
        rows.push(currentRow)
        currentRow = [metadata.length]
      }
    })
  })

  test('non trusted invalid user', done => {
    let adjusted = connStr.replace('Trusted_Connection=Yes', 'Trusted_Connection=No;Uid=test;Database=test;Pwd=...')
    adjusted = adjusted.replace('Uid=sa', 'Uid=JohnSnow')
    sql.open(adjusted,
      err => {
        assert(err)
        assert(err.message.indexOf('Login failed for user') > 0)
        done()
      })
  })

  test('callback multiple errors', done => {
    const errors = []
    theConnection.query('select a;select b;', (err, res, more) => {
      if (err) {
        errors.push(err.message)
      }
      if (!more) {
        assert.deepStrictEqual(errors, [
          '[Microsoft][SQL Server Native Client 11.0][SQL Server]Invalid column name \'a\'.',
          '[Microsoft][SQL Server Native Client 11.0][SQL Server]Invalid column name \'b\'.'
        ])
        done()
      }
    })
  })

  test('event based multiple errors', done => {
    const errors = []
    let callbacks = 0
    const q = theConnection.query('select a;select b;')
    q.on('error', (err, more) => {
      ++callbacks
      errors.push(err.message)
      if (!more) {
        assert.deepStrictEqual(callbacks, 2)
        assert.deepStrictEqual(errors, [
          '[Microsoft][SQL Server Native Client 11.0][SQL Server]Invalid column name \'a\'.',
          '[Microsoft][SQL Server Native Client 11.0][SQL Server]Invalid column name \'b\'.'
        ])
        done()
      }
    })
  })
})
