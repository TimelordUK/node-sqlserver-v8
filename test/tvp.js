'use strict'

/* globals describe it */

const assert = require('assert')
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()

describe('tvp', function () {
  this.timeout(30000)

  this.beforeEach(done => {
    env.open().then(() => done())
  })

  this.afterEach(done => {
    env.close().then(() => done())
  })

  it('use tvp simple test type insert test extended ascii', testDone => {
    const tableName = 'TestTvp'
    let table
    const helper = env.tvpHelper(tableName)
    const vec = helper.getExtendedVec(8 * 1024)
    const fns = [

      async asyncDone => {
        table = await helper.create(tableName)
        table.addRowsFromObjects(vec)
        asyncDone()
      },

      asyncDone => {
        const tp = env.sql.TvpFromTable(table)
        table.rows = []
        env.theConnection.query('exec insertTestTvp @tvp = ?;', [tp], err => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        env.theConnection.query(`select * from ${tableName}`, (err, res) => {
          assert.ifError(err)
          assert.deepStrictEqual(res, vec)
          asyncDone()
        })
      }
    ]

    env.async.series(fns, () => {
      testDone()
    })
  })

  it('use tvp simple test type insert test long string 8 * 1024', testDone => {
    const tableName = 'TestTvp'
    let table
    const helper = env.tvpHelper(tableName)
    const vec = helper.getVec(8 * 1024)
    const fns = [

      async asyncDone => {
        table = await helper.create(tableName)
        table.addRowsFromObjects(vec)
        asyncDone()
      },

      asyncDone => {
        const tp = env.sql.TvpFromTable(table)
        table.rows = []
        env.theConnection.query('exec insertTestTvp @tvp = ?;', [tp], err => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        env.theConnection.query(`select * from ${tableName}`, (err, res) => {
          assert.ifError(err)
          assert.deepStrictEqual(res, vec)
          asyncDone()
        })
      }
    ]

    env.async.series(fns, () => {
      testDone()
    })
  })

  it('call tvp proc with local table', testDone => {
    const tableName = 'TestTvp'
    const all = []
    const expected = [
      [
        {
          Column0: 'Insert Complete'
        }
      ],
      [
        {
          description: 'a user',
          username: 'newuser1',
          age: 55,
          salary: 99000,
          code: 98765432109876,
          start_date: new Date(2010, 1, 10)
        }
      ],
      [
        {
          Column0: 'Select Complete'
        }
      ]
    ]
    let procedure
    expected[1][0].start_date.nanosecondsDelta = 0
    const helper = env.tvpHelper(tableName)
    const fns = [

      async asyncDone => {
        await helper.create(tableName)
        asyncDone()
      },

      asyncDone => {
        const pm = env.theConnection.procedureMgr()
        pm.get('localTableProcedure', p => {
          assert(p)
          procedure = p
          asyncDone()
        })
      },

      asyncDone => {
        procedure.call(['a user', 'newuser1', 55, 99000, 98765432109876, new Date(2010, 1, 10)], (err, res, output, more) => {
          assert.ifError(err)
          all.push(res)
          if (!output) return
          assert.strictEqual(1, res.length)
          assert.deepStrictEqual(expected, all)
          asyncDone()
        })
      }
    ]

    env.async.series(fns, () => {
      testDone()
    })
  })

  it('call tvp proc from proc', testDone => {
    const tableName = 'TestTvp'
    const all = []
    const expected = [
      [
        {
          Column0: 'Insert Complete'
        }
      ],
      [
        {
          Column0: 'Insert 2 Complete'
        }
      ],
      [
        {
          description: 'a user',
          username: 'newuser1',
          age: 55,
          salary: 99000,
          code: 98765432109876,
          start_date: new Date(2010, 1, 10)
        },
        {
          description: 'a user',
          username: 'newuser1',
          age: 55,
          salary: 99000,
          code: 98765432109876,
          start_date: new Date(2010, 1, 10)
        }
      ]
    ]
    let procedure
    expected[2][0].start_date.nanosecondsDelta = 0
    expected[2][1].start_date.nanosecondsDelta = 0
    const helper = env.tvpHelper(tableName)
    const fns = [

      async asyncDone => {
        await helper.create(tableName)
        asyncDone()
      },

      asyncDone => {
        const pm = env.theConnection.procedureMgr()
        pm.get('callProcedureFromProcedure', p => {
          assert(p)
          procedure = p
          asyncDone()
        })
      },

      asyncDone => {
        procedure.call(['a user', 'newuser1', 55, 99000, 98765432109876, new Date(2010, 1, 10)], (err, res, output, more) => {
          assert.ifError(err)
          all.push(res)
          if (!output) return
          assert.strictEqual(2, res.length)
          assert.deepStrictEqual(expected, all)
          asyncDone()
        })
      }
    ]

    env.async.series(fns, () => {
      testDone()
    })
  })

  it('use tvp to select from table type complex object Employee type', testDone => {
    const tableName = 'employee'
    let bulkMgr

    const fns = [

      asyncDone => {
        env.helper.dropCreateTable({
          tableName
        }, () => {
          asyncDone()
        })
      },

      asyncDone => {
        const tm = env.theConnection.tableMgr()
        tm.bind(tableName, bulk => {
          bulkMgr = bulk
          asyncDone()
        })
      },

      asyncDone => {
        let sql = 'IF TYPE_ID(N\'EmployeeType\') IS not NULL'
        sql += ' drop type EmployeeType'
        env.theConnection.query(sql, err => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        const sql = bulkMgr.asUserType()
        env.theConnection.query(sql, err => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        const parsedJSON = env.helper.getJSON()
        // construct a table type based on a table definition.
        const table = bulkMgr.asTableType()
        // convert a set of objects to rows
        table.addRowsFromObjects(parsedJSON)
        // use a type the native driver can understand, using column based bulk binding.
        const tp = env.sql.TvpFromTable(table)
        env.theConnection.query('select * from ?;', [tp], (err, res) => {
          assert.ifError(err)
          env.helper.compareEmployee(res, parsedJSON)
          asyncDone()
        })
      }
    ]

    env.async.series(fns, () => {
      testDone()
    })
  })

  it('employee use tm to get a table value type representing table and create that user table type', testDone => {
    const tableName = 'employee'
    let bulkMgr

    const fns = [

      asyncDone => {
        env.helper.dropCreateTable({
          tableName
        }, () => {
          asyncDone()
        })
      },

      asyncDone => {
        const tm = env.theConnection.tableMgr()
        tm.bind(tableName, bulk => {
          bulkMgr = bulk
          asyncDone()
        })
      },

      asyncDone => {
        let sql = 'IF TYPE_ID(N\'EmployeeType\') IS not NULL'
        sql += ' drop type EmployeeType'
        env.theConnection.query(sql, err => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        const sql = bulkMgr.asUserType()
        env.theConnection.query(sql, err => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        env.theConnection.getUserTypeTable('EmployeeType', (err, def) => {
          assert.ifError(err)
          const summary = bulkMgr.getSummary()
          assert(def.columns.length = summary.columns.length)
          const t = bulkMgr.asTableType()
          assert(t.columns.length === summary.columns.length)
          asyncDone()
        })
      }
    ]

    env.async.series(fns, () => {
      testDone()
    })
  })

  it('use tvp simple test type insert test using pm', testDone => {
    const tableName = 'TestTvp'
    let table
    let procedure
    const helper = env.tvpHelper(tableName)
    const vec = helper.getVec(100)
    const fns = [

      async asyncDone => {
        table = await helper.create(tableName)
        table.addRowsFromObjects(vec)
        asyncDone()
      },

      asyncDone => {
        const pm = env.theConnection.procedureMgr()
        pm.get('insertTestTvp', p => {
          assert(p)
          procedure = p
          asyncDone()
        })
      },

      asyncDone => {
        const tp = env.sql.TvpFromTable(table)
        table.rows = []
        procedure.call([tp], err => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        env.theConnection.query(`select * from ${tableName}`, (err, res) => {
          assert.ifError(err)
          assert.deepStrictEqual(vec, res)
          asyncDone()
        })
      }
    ]

    env.async.series(fns, () => {
      testDone()
    })
  })

  it('non dbo schema use tvp simple test type select test', testDone => {
    const tableName = 'TestSchema.TestTvp'
    let table
    const helper = env.tvpHelper(tableName)
    const vec = helper.getVec(100)
    const fns = [

      async asyncDone => {
        table = await helper.create(tableName)
        table.addRowsFromObjects(vec)
        asyncDone()
      },

      asyncDone => {
        const tp = env.sql.TvpFromTable(table)
        table.rows = []
        env.theConnection.query('select * from ?;', [tp], (err, res) => {
          assert.ifError(err)
          assert.deepStrictEqual(res, vec)
          asyncDone()
        })
      }
    ]

    env.async.series(fns, () => {
      testDone()
    })
  })

  it('use tvp simple test type select test', testDone => {
    const tableName = 'TestTvp'
    let table
    const helper = env.tvpHelper(tableName)
    const vec = helper.getVec(100)
    const fns = [

      async asyncDone => {
        table = await helper.create(tableName)
        table.addRowsFromObjects(vec)
        asyncDone()
      },

      asyncDone => {
        const tp = env.sql.TvpFromTable(table)
        table.rows = []
        env.theConnection.query('select * from ?;', [tp], (err, res) => {
          assert.ifError(err)
          assert.deepStrictEqual(res, vec)
          asyncDone()
        })
      }
    ]

    env.async.series(fns, () => {
      testDone()
    })
  })

  it('use tvp simple test type insert test', testDone => {
    const tableName = 'TestTvp'
    let table
    const helper = env.tvpHelper(tableName)
    const vec = helper.getVec(100)
    const fns = [

      async asyncDone => {
        table = await helper.create(tableName)
        table.addRowsFromObjects(vec)
        asyncDone()
      },

      asyncDone => {
        const tp = env.sql.TvpFromTable(table)
        table.rows = []
        env.theConnection.query('exec insertTestTvp @tvp = ?;', [tp], err => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        env.theConnection.query(`select * from ${tableName}`, (err, res) => {
          assert.ifError(err)
          assert.deepStrictEqual(vec, res)
          asyncDone()
        })
      }
    ]

    env.async.series(fns, () => {
      testDone()
    })
  })
})
