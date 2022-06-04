
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

'use strict'

/* globals describe it */

const assert = require('assert')
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()

describe('txn', function () {
  this.timeout(30000)

  this.beforeEach(done => {
    env.open().then(() => done())
  })

  this.afterEach(done => {
    env.close().then(() => done())
  })

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

  it('setup for tests', testDone => {
    // single setup necessary for the test
    const tester = env.bulkTableTest(txnTableDef)
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

    env.async.series(fns, () => {
      testDone()
    })
  })

  it('begin a transaction and use streaming with error on constraint to trigger rollback detection', done => {
    const helper = env.bulkTableTest(activityTableDef)
    const fns = [

      async asyncDone => {
        await helper.create()
        asyncDone()
      },

      asyncDone => {
        env.theConnection.beginTransaction(err => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        env.theConnection.query(helper.insertParamsSql, [1, 'jogging'], (err) => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        const q = env.theConnection.query(helper.insertParamsSql, [1, 'sprinting'])
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
          env.theConnection.rollback(err => {
            assert.ifError(err)
            asyncDone()
          })
        })
      },

      asyncDone => {
        env.theConnection.queryRaw(helper.selectSql, (err, results) => {
          assert.ifError(err)
          assert.deepStrictEqual(results.rows, [])
          asyncDone()
        })
      }
    ]
    env.async.series(fns, () => {
      done()
    })
  })

  it('begin a transaction and rollback on violation and insert valid', done => {
    const helper = env.bulkTableTest(activityTableDef)
    const fns = [

      async asyncDone => {
        await helper.create()
        asyncDone()
      },

      asyncDone => {
        env.theConnection.beginTransaction(err => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        env.theConnection.query(helper.insertParamsSql, [1, 'jogging'], (err) => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        const q = env.theConnection.query(helper.insertParamsSql, [1, 'sprinting'])
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
          env.theConnection.rollback(err => {
            assert.ifError(err)
            asyncDone()
          })
        })
      },

      // at this stage rolled back and expect no rows

      asyncDone => {
        env.theConnection.queryRaw(helper.selectSql, (err, results) => {
          assert.ifError(err)
          assert.deepStrictEqual(results.rows, [])
          asyncDone()
        })
      },

      // add 2 more valid rows with no transaction

      asyncDone => {
        env.theConnection.query(helper.insertParamsSql, [1, 'jogging'], (err) => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        env.theConnection.query(helper.insertParamsSql, [2, 'sprinting'], (err) => {
          assert.ifError(err)
          asyncDone()
        })
      },

      // now expect 2 rows to be present

      asyncDone => {
        env.theConnection.query(helper.selectSql, (err, results) => {
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
    env.async.series(fns, () => {
      done()
    })
  })

  it('begin a transaction and add two rows no constraint violation, commit and check', done => {
    const helper = env.bulkTableTest(activityTableDef)
    const fns = [

      async asyncDone => {
        await helper.create()
        asyncDone()
      },

      asyncDone => {
        env.theConnection.beginTransaction(err => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        env.theConnection.query(helper.insertParamsSql, [1, 'jogging'], (err) => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        env.theConnection.query(helper.insertParamsSql, [2, 'sprinting'], (err) => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        env.theConnection.commit(err => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        env.theConnection.query(helper.selectSql, (err, results) => {
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
    env.async.series(fns, () => {
      done()
    })
  })

  it('begin a transaction and rollback with no query', done => {
    env.theConnection.beginTransaction(err => {
      assert.ifError(err)
    })
    env.theConnection.rollback(err => {
      assert.ifError(err)
      done()
    })
  })

  it('begin a transaction and rollback with no query and no callback', done => {
    try {
      env.theConnection.beginTransaction()
      env.theConnection.rollback(err => {
        assert.ifError(err)
        done()
      })
    } catch (e) {
      assert(e === false)
    }
  })

  it('begin a transaction and commit', testDone => {
    const tester = env.bulkTableTest(txnTableDef)
    const fns = [

      asyncDone => {
        env.theConnection.beginTransaction(err => {
          assert.ifError(err)
          asyncDone()
        })
      },
      asyncDone => {
        env.theConnection.queryRaw(`${tester.insertSql} ('Anne')`, (err, results) => {
          assert.ifError(err)
          assert.deepStrictEqual(results, { meta: null, rowcount: 1 }, 'Insert results don\'t match')
          asyncDone()
        })
      },
      asyncDone => {
        env.theConnection.queryRaw(`${tester.insertSql} ('Bob')`, (err, results) => {
          assert.ifError(err)
          assert.deepStrictEqual(results, { meta: null, rowcount: 1 }, 'Insert results don\'t match')
          asyncDone()
        })
      },
      asyncDone => {
        env.theConnection.commit(err => {
          assert.ifError(err)
          asyncDone()
        })
      },
      asyncDone => {
        env.theConnection.queryRaw(tester.selectSql, (err, results) => {
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
    env.async.series(fns, () => {
      testDone()
    })
  })

  it('begin a transaction and rollback', testDone => {
    const tester = env.bulkTableTest(txnTableDef)
    const fns = [

      asyncDone => {
        env.theConnection.beginTransaction(err => {
          assert.ifError(err)
          asyncDone()
        })
      },
      asyncDone => {
        env.theConnection.queryRaw(`${tester.insertSql} ('Carl')`, (err, results) => {
          assert.ifError(err)
          assert.deepStrictEqual(results, { meta: null, rowcount: 1 }, 'Insert results don\'t match')
          asyncDone()
        })
      },
      asyncDone => {
        env.theConnection.queryRaw(`${tester.insertSql} ('Dana')`, (err, results) => {
          assert.ifError(err)
          assert.deepStrictEqual(results, { meta: null, rowcount: 1 }, 'Insert results don\'t match')
          asyncDone()
        })
      },
      asyncDone => {
        env.theConnection.rollback(err => {
          assert.ifError(err)
          asyncDone()
        })
      },
      asyncDone => {
        env.theConnection.queryRaw(tester.selectSql, (err, results) => {
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

    env.async.series(fns, () => {
      testDone()
    })
  })

  it('begin a transaction and then query with an error', testDone => {
    const tester = env.bulkTableTest(txnTableDef)
    const fns = [
      asyncDone => {
        env.theConnection.beginTransaction(err => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        const q = env.theConnection.queryRaw('INSERT INTO test_txn (name) VALUES (\'Carl\')\'m with STUPID')
        // events are emitted before callbacks are called currently
        q.on('error', err => {
          const expected = new Error(`[Microsoft][${env.driver}][SQL Server]Unclosed quotation mark after the character string 'm with STUPID'.`)
          expected.sqlstate = '42000'
          expected.code = 105
          expected.severity = 15
          expected.procName = ''
          expected.lineNumber = 1

          assert(err instanceof Error)
          assert(err.serverName.length > 0)
          delete err.serverName
          assert.deepStrictEqual(err, expected, 'Transaction should have caused an error')

          env.theConnection.rollback(err => {
            assert.ifError(err)
            asyncDone()
          })
        })
      },

      asyncDone => {
        env.theConnection.queryRaw(tester.selectSql, (err, results) => {
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

    env.async.series(fns, () => {
      testDone()
    })
  })

  it('begin a transaction and commit (with no async support)', testDone => {
    const tester = env.bulkTableTest(txnTableDef)
    env.theConnection.beginTransaction(err => {
      assert.ifError(err)
    })

    env.theConnection.queryRaw(`${tester.insertSql} ('Anne')`, (err) => {
      assert.ifError(err)
    })

    env.theConnection.queryRaw(`${tester.insertSql} ('Bob')`, (err) => {
      assert.ifError(err)
    })

    env.theConnection.commit(err => {
      assert.ifError(err)
    })

    env.theConnection.queryRaw(tester.selectSql, (err, results) => {
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
