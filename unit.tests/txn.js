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

  test('setup for tests', testDone => {
    // single setup necessary for the test

    const fns = [

      asyncDone => {
        try {
          sql.query(connStr, 'drop table test_txn', () => {
            asyncDone()
          })
        } catch (e) {
          asyncDone() // skip any errors because the table might not exist
        }
      },
      asyncDone => {
        sql.query(connStr, 'create table test_txn (id int identity, name varchar(100))', err => {
          assert.ifError(err)
          asyncDone()
        })
      },
      asyncDone => {
        theConnection.queryRaw('create clustered index index_txn on test_txn (id)', err => {
          assert.ifError(err)
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  class TxnHelper {
    constructor (theConnection) {
      const tableName = 'test_txn_sales'
      const dropTableSql = `IF OBJECT_ID('${tableName}', 'U') IS NOT NULL 
    DROP TABLE ${tableName};`

      const createTableSql = `CREATE TABLE ${tableName} (
        activity_id INT PRIMARY KEY,
        activity_name VARCHAR (255) NOT NULL
    );`

      const insertSql = `INSERT INTO ${tableName} (activity_id, activity_name) VALUES (?, ?)`
      const selectSql = `select activity_id, activity_name from ${tableName}`

      async function create () {
        const promisedQuery = util.promisify(theConnection.query)
        await promisedQuery(dropTableSql)
        await promisedQuery(createTableSql)
      }

      this.create = create
      this.insertSql = insertSql
      this.selectSql = selectSql
    }
  }

  test('begin a transaction and use streaming with error on constraint to trigger rollback detection', done => {
    const helper = new TxnHelper(theConnection)
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
        theConnection.query(helper.insertSql, [1, 'jogging'], (err) => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        const q = theConnection.query(helper.insertSql, [1, 'sprinting'])
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
    const helper = new TxnHelper(theConnection)
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
        theConnection.query(helper.insertSql, [1, 'jogging'], (err) => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        const q = theConnection.query(helper.insertSql, [1, 'sprinting'])
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
        theConnection.query(helper.insertSql, [1, 'jogging'], (err) => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        theConnection.query(helper.insertSql, [2, 'sprinting'], (err) => {
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
    const helper = new TxnHelper(theConnection)
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
        theConnection.query(helper.insertSql, [1, 'jogging'], (err) => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        theConnection.query(helper.insertSql, [2, 'sprinting'], (err) => {
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
    const fns = [

      asyncDone => {
        theConnection.beginTransaction(err => {
          assert.ifError(err)
          asyncDone()
        })
      },
      asyncDone => {
        theConnection.queryRaw('INSERT INTO test_txn (name) VALUES (\'Anne\')', (err, results) => {
          assert.ifError(err)
          assert.deepStrictEqual(results, { meta: null, rowcount: 1 }, 'Insert results don\'t match')
          asyncDone()
        })
      },
      asyncDone => {
        theConnection.queryRaw('INSERT INTO test_txn (name) VALUES (\'Bob\')', (err, results) => {
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
        theConnection.queryRaw('select * from test_txn', (err, results) => {
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
    const fns = [

      asyncDone => {
        theConnection.beginTransaction(err => {
          assert.ifError(err)
          asyncDone()
        })
      },
      asyncDone => {
        theConnection.queryRaw('INSERT INTO test_txn (name) VALUES (\'Carl\')', (err, results) => {
          assert.ifError(err)
          assert.deepStrictEqual(results, { meta: null, rowcount: 1 }, 'Insert results don\'t match')
          asyncDone()
        })
      },
      asyncDone => {
        theConnection.queryRaw('INSERT INTO test_txn (name) VALUES (\'Dana\')', (err, results) => {
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
        theConnection.queryRaw('select * from test_txn', (err, results) => {
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

          assert.deepStrictEqual(err, expected, 'Transaction should have caused an error')

          theConnection.rollback(err => {
            assert.ifError(err)
            asyncDone()
          })
        })
      },

      asyncDone => {
        theConnection.queryRaw('select * from test_txn', (err, results) => {
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
    theConnection.beginTransaction(err => {
      assert.ifError(err)
    })

    theConnection.queryRaw('INSERT INTO test_txn (name) VALUES (\'Anne\')', err => {
      assert.ifError(err)
    })

    theConnection.queryRaw('INSERT INTO test_txn (name) VALUES (\'Bob\')', err => {
      assert.ifError(err)
    })

    theConnection.commit(err => {
      assert.ifError(err)
    })

    theConnection.queryRaw('select * from test_txn', (err, results) => {
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
