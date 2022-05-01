
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

const assert = require('assert')
const supp = require('../samples/typescript/demo-support')
const util = require('util')

suite('txn', function () {
  let theConnection
  this.timeout(20000)
  let connStr
  let async
  let helper
  let driver

  const sql = global.native_sql

  setup(testDone => {
    supp.GlobalConn.init(sql, co => {
      connStr = global.conn_str || co.conn_str
      driver = co.driver
      driver = co.driver
      const myRegexp = /Driver=\{(.*?)\}.*$/g
      const match = myRegexp.exec(connStr)
      driver = match[1]
      async = co.async
      helper = co.helper
      helper.setVerbose(false)
      sql.open(connStr, (err, newConn) => {
        assert(err === false)
        theConnection = newConn
        testDone()
      })
    }, global.conn_str)
  })

  teardown(done => {
    theConnection.close(() => {
      done()
    })
  })

  class TxnTableTest {
    constructor (c, def) {
      function where (list, primitive) {
        return list.reduce((agg, latest) => {
          if (primitive(latest)) {
            agg.push(latest)
          }
          return agg
        }, [])
      }
      const tableName = def.tableName
      const columns = def.columns.map(e => `${e.name} ${e.type}`).join(', ')
      const insertColumnNames = where(def.columns, c => {
        const res = !c.type.includes('identity')
        return res
      }).map(e => `${e.name}`).join(', ')
      const columnNames = def.columns.map(e => `${e.name}`).join(', ')
      const dropTableSql = `IF OBJECT_ID('${tableName}', 'U') IS NOT NULL DROP TABLE ${tableName};`
      const createTableSql = `CREATE TABLE ${tableName} (${columns})`
      const clusteredSql = `CREATE CLUSTERED INDEX IX_${tableName} ON ${tableName}(id)`
      const insertSql = `INSERT INTO ${tableName} (${insertColumnNames}) VALUES `
      const selectSql = `SELECT ${columnNames} FROM ${tableName}`
      const trucateSql = `TRUNCATE TABLE ${tableName}`
      const paramsSql = `(${def.columns.map(_ => '?').join(', ')})`

      this.definition = def
      this.theConnection = c
      this.dropTableSql = dropTableSql
      this.createTableSql = createTableSql
      this.clusteredSql = clusteredSql
      this.selectSql = selectSql
      this.insertSql = insertSql
      this.truncateSql = trucateSql
      this.tableName = def.tableName
      this.paramsSql = paramsSql
      this.insertParamsSql = `${insertSql} ${paramsSql}`
    }

    async create () {
      const promisedRaw = util.promisify(this.theConnection.queryRaw)
      await promisedRaw(this.dropTableSql)
      await promisedRaw(this.createTableSql)
    }
  }

  const txnTableDef = {
    tableName: 'test_txn',
    columns: [
      {
        name: 'id',
        type: 'int identity'
      },
      {
        name: 'name',
        type: 'VARCHAR (100)'
      }
    ]
  }

  const activityTableDef = {
    tableName: 'test_txn_sales',
    columns: [
      {
        name: 'activity_id',
        type: 'INT PRIMARY KEY'
      },
      {
        name: 'activity_name',
        type: 'VARCHAR (255) NOT NULL'
      }
    ]
  }

  test('setup for tests', testDone => {
    // single setup necessary for the test
    const tester = new TxnTableTest(theConnection, txnTableDef)
    const fns = [
      async asyncDone => {
        try {
          await tester.create()
          asyncDone()
        } catch (e) {
          assert(e)
          asyncDone() // skip any errors because the table might not exist
        }
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test('begin a transaction and use streaming with error on constraint to trigger rollback detection', done => {
    const helper = new TxnTableTest(theConnection, activityTableDef)
    const fns = [

      async asyncDone => {
        await helper.create()
        asyncDone()
      },

      asyncDone => {
        theConnection.beginTransaction(err => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        theConnection.query(helper.insertParamsSql, [1, 'jogging'], (err) => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        const q = theConnection.query(helper.insertParamsSql, [1, 'sprinting'])
        const errors = []
        q.on('error', (err, more) => {
          errors.push(err)
          if (more) return
          const msgs = errors.map(e => e.message)
          assert.deepStrictEqual(1, msgs.length)
          assert(msgs[0].includes('Violation of PRIMARY KEY'))
        })

        q.on('info', i => {
          const msg = i.message
          assert(msg.includes('statement has been terminated'))
        })

        q.on('free', () => {
          theConnection.rollback(err => {
            assert.ifError(err)
            asyncDone()
          })
        })
      },

      asyncDone => {
        theConnection.queryRaw(helper.selectSql, (err, results) => {
          assert.ifError(err)
          assert.deepStrictEqual(results.rows, [])
          asyncDone()
        })
      }
    ]
    async.series(fns, () => {
      done()
    })
  })

  test('begin a transaction and rollback on violation and insert valid', done => {
    const helper = new TxnTableTest(theConnection, activityTableDef)
    const fns = [

      async asyncDone => {
        await helper.create()
        asyncDone()
      },

      asyncDone => {
        theConnection.beginTransaction(err => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        theConnection.query(helper.insertParamsSql, [1, 'jogging'], (err) => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        const q = theConnection.query(helper.insertParamsSql, [1, 'sprinting'])
        const errors = []
        q.on('error', (err, more) => {
          errors.push(err)
          if (more) return
          const msgs = errors.map(e => e.message)
          assert.deepStrictEqual(1, msgs.length)
          assert(msgs[0].includes('Violation of PRIMARY KEY'))
        })

        q.on('info', i => {
          const msg = i.message
          assert(msg.includes('statement has been terminated'))
        })

        q.on('free', () => {
          theConnection.rollback(err => {
            assert.ifError(err)
            asyncDone()
          })
        })
      },

      // at this stage rolled back and expect no rows

      asyncDone => {
        theConnection.queryRaw(helper.selectSql, (err, results) => {
          assert.ifError(err)
          assert.deepStrictEqual(results.rows, [])
          asyncDone()
        })
      },

      // add 2 more valid rows with no transaction

      asyncDone => {
        theConnection.query(helper.insertParamsSql, [1, 'jogging'], (err) => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        theConnection.query(helper.insertParamsSql, [2, 'sprinting'], (err) => {
          assert.ifError(err)
          asyncDone()
        })
      },

      // now expect 2 rows to be present

      asyncDone => {
        theConnection.query(helper.selectSql, (err, results) => {
          assert.ifError(err)
          assert.deepStrictEqual(results, [{
            activity_id: 1,
            activity_name: 'jogging'
          },
          {
            activity_id: 2,
            activity_name: 'sprinting'
          }])
          asyncDone()
        })
      }
    ]
    async.series(fns, () => {
      done()
    })
  })

  test('begin a transaction and add two rows no constraint violation, commit and check', done => {
    const helper = new TxnTableTest(theConnection, activityTableDef)
    const fns = [

      async asyncDone => {
        await helper.create()
        asyncDone()
      },

      asyncDone => {
        theConnection.beginTransaction(err => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        theConnection.query(helper.insertParamsSql, [1, 'jogging'], (err) => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        theConnection.query(helper.insertParamsSql, [2, 'sprinting'], (err) => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        theConnection.commit(err => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        theConnection.query(helper.selectSql, (err, results) => {
          assert.ifError(err)
          assert.deepStrictEqual(results, [{
            activity_id: 1,
            activity_name: 'jogging'
          },
          {
            activity_id: 2,
            activity_name: 'sprinting'
          }])
          asyncDone()
        })
      }
    ]
    async.series(fns, () => {
      done()
    })
  })

  test('begin a transaction and rollback with no query', done => {
    theConnection.beginTransaction(err => {
      assert.ifError(err)
    })
    theConnection.rollback(err => {
      assert.ifError(err)
      done()
    })
  })

  test('begin a transaction and rollback with no query and no callback', done => {
    try {
      theConnection.beginTransaction()
      theConnection.rollback(err => {
        assert.ifError(err)
        done()
      })
    } catch (e) {
      assert(e === false)
    }
  })

  test('begin a transaction and commit', testDone => {
    const tester = new TxnTableTest(theConnection, txnTableDef)
    const fns = [

      asyncDone => {
        theConnection.beginTransaction(err => {
          assert.ifError(err)
          asyncDone()
        })
      },
      asyncDone => {
        theConnection.queryRaw(`${tester.insertSql} ('Anne')`, (err, results) => {
          assert.ifError(err)
          assert.deepStrictEqual(results, { meta: null, rowcount: 1 }, 'Insert results don\'t match')
          asyncDone()
        })
      },
      asyncDone => {
        theConnection.queryRaw(`${tester.insertSql} ('Bob')`, (err, results) => {
          assert.ifError(err)
          assert.deepStrictEqual(results, { meta: null, rowcount: 1 }, 'Insert results don\'t match')
          asyncDone()
        })
      },
      asyncDone => {
        theConnection.commit(err => {
          assert.ifError(err)
          asyncDone()
        })
      },
      asyncDone => {
        theConnection.queryRaw(tester.selectSql, (err, results) => {
          assert.ifError(err)

          // verify results
          const expected = {
            meta: [{
              name: 'id',
              size: 10,
              nullable: false,
              type: 'number',
              sqlType: 'int identity'
            },
            { name: 'name', size: 100, nullable: true, type: 'text', sqlType: 'varchar' }],
            rows: [[1, 'Anne'], [2, 'Bob']]
          }

          assert.deepStrictEqual(results, expected, 'Transaction not committed properly')
          asyncDone()
        })
      }
    ]
    async.series(fns, () => {
      testDone()
    })
  })

  test('begin a transaction and rollback', testDone => {
    const tester = new TxnTableTest(theConnection, txnTableDef)
    const fns = [

      asyncDone => {
        theConnection.beginTransaction(err => {
          assert.ifError(err)
          asyncDone()
        })
      },
      asyncDone => {
        theConnection.queryRaw(`${tester.insertSql} ('Carl')`, (err, results) => {
          assert.ifError(err)
          assert.deepStrictEqual(results, { meta: null, rowcount: 1 }, 'Insert results don\'t match')
          asyncDone()
        })
      },
      asyncDone => {
        theConnection.queryRaw(`${tester.insertSql} ('Dana')`, (err, results) => {
          assert.ifError(err)
          assert.deepStrictEqual(results, { meta: null, rowcount: 1 }, 'Insert results don\'t match')
          asyncDone()
        })
      },
      asyncDone => {
        theConnection.rollback(err => {
          assert.ifError(err)
          asyncDone()
        })
      },
      asyncDone => {
        theConnection.queryRaw(tester.selectSql, (err, results) => {
          assert.ifError(err)

          // verify results
          const expected = {
            meta: [{
              name: 'id',
              size: 10,
              nullable: false,
              type: 'number',
              sqlType: 'int identity'
            },
            { name: 'name', size: 100, nullable: true, type: 'text', sqlType: 'varchar' }],
            rows: [[1, 'Anne'], [2, 'Bob']]
          }

          assert.deepStrictEqual(results, expected, 'Transaction not rolled back properly')
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test('begin a transaction and then query with an error', testDone => {
    const tester = new TxnTableTest(theConnection, txnTableDef)
    const fns = [
      asyncDone => {
        theConnection.beginTransaction(err => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        const q = theConnection.queryRaw('INSERT INTO test_txn (name) VALUES (\'Carl\')\'m with STUPID')
        // events are emitted before callbacks are called currently
        q.on('error', err => {
          const expected = new Error(`[Microsoft][${driver}][SQL Server]Unclosed quotation mark after the character string 'm with STUPID'.`)
          expected.sqlstate = '42000'
          expected.code = 105
          expected.severity = 15
          expected.procName = ''
          expected.lineNumber = 1

          assert(err instanceof Error)
          assert(err.serverName.length > 0)
          delete err.serverName
          assert.deepStrictEqual(err, expected, 'Transaction should have caused an error')

          theConnection.rollback(err => {
            assert.ifError(err)
            asyncDone()
          })
        })
      },

      asyncDone => {
        theConnection.queryRaw(tester.selectSql, (err, results) => {
          assert.ifError(err)

          // verify results
          const expected = {
            meta: [{
              name: 'id',
              size: 10,
              nullable: false,
              type: 'number',
              sqlType: 'int identity'
            },
            { name: 'name', size: 100, nullable: true, type: 'text', sqlType: 'varchar' }],
            rows: [[1, 'Anne'], [2, 'Bob']]
          }

          assert.deepStrictEqual(results, expected, 'Transaction not rolled back properly')
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test('begin a transaction and commit (with no async support)', testDone => {
    const tester = new TxnTableTest(theConnection, txnTableDef)
    theConnection.beginTransaction(err => {
      assert.ifError(err)
    })

    theConnection.queryRaw(`${tester.insertSql} ('Anne')`, (err) => {
      assert.ifError(err)
    })

    theConnection.queryRaw(`${tester.insertSql} ('Bob')`, (err) => {
      assert.ifError(err)
    })

    theConnection.commit(err => {
      assert.ifError(err)
    })

    theConnection.queryRaw(tester.selectSql, (err, results) => {
      assert.ifError(err)

      // verify results
      const expected = {
        meta: [
          { name: 'id', size: 10, nullable: false, type: 'number', sqlType: 'int identity' },
          { name: 'name', size: 100, nullable: true, type: 'text', sqlType: 'varchar' }
        ],
        rows: [
          [1, 'Anne'], [2, 'Bob'], [5, 'Anne'], [6, 'Bob']
        ]
      }

      assert.deepStrictEqual(results, expected, 'Transaction not committed properly')

      testDone()
    })
  })
})
