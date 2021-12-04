'use strict'
/* global suite teardown teardown test setup */

const supp = require('../samples/typescript/demo-support')
const assert = require('assert')

suite('bulk', function () {
  let theConnection
  this.timeout(30000)
  let tm
  let connStr
  const totalObjectsForInsert = 10
  const test1BatchSize = 1
  const test2BatchSize = 10
  let async
  let helper

  const sql = global.native_sql

  setup(testDone => {
    supp.GlobalConn.init(sql, co => {
      connStr = global.conn_str || co.conn_str
      async = co.async
      helper = co.helper
      helper.setVerbose(false)
      sql.open(connStr, (err, newConn) => {
        assert(err === null || err === false)
        theConnection = newConn
        testDone()
      })
    }, global.conn_str)
  })

  teardown(done => {
    theConnection.close(err => {
      assert(err === null || err === false || err === undefined)
      done()
    })
  })

  function getInsertVector (count) {
    const v = []

    for (let i = 0; i < count; ++i) {
      v.push({
        BusinessEntityID: i,
        NationalIDNumber: `NI:0000${i}`,
        LoginID: `user${i}`,
        Salary: i + 10000
      })
    }

    return v
  }

  class TableHelper {
    constructor (theConnection) {
      const tableName = 'test_bulk_table'
      const dropTableSql = `IF OBJECT_ID('${tableName}', 'U') IS NOT NULL 
    DROP TABLE ${tableName};`

      const createTableSql = `CREATE TABLE ${tableName} (
        id INT PRIMARY KEY,
        col_a int,
        col_b int, 
        col_c int,
        col_d int,
        col_e int,
        col_f int,
    );`

      function getVec (count) {
        const v = []
        for (let i = 0; i < count; ++i) {
          v.push({
            id: i,
            col_a: (i + 1) * 10 + i,
            col_b: (i + 1) * 100 + i,
            col_c: (i + 1) * 1000 + i,
            col_d: (i + 1) * 10000 + i,
            col_e: (i + 1) * 100000 + i,
            col_f: (i + 1) * 1000000 + i
          })
        }
        return v
      }

      async function create () {
        await theConnection.promises.query(dropTableSql)
        await theConnection.promises.query(createTableSql)
        const table = await theConnection.promises.getTable(tableName)
        return table
      }

      this.create = create
      this.getVec = getVec
    }
  }

  class TypeTableHelper {
    constructor (theConnection, sqlType) {
      const tableName = 'test_bulk_table'
      const dropTableSql = `IF OBJECT_ID('${tableName}', 'U') IS NOT NULL 
    DROP TABLE ${tableName};`

      const createTableSql = `CREATE TABLE ${tableName} (
        id INT PRIMARY KEY,
        col_a ${sqlType}
    );`

      function getVec (count, generator) {
        const v = []
        for (let i = 0; i < count; ++i) {
          const val = generator(i)
          v.push({
            id: i,
            col_a: val
          })
        }
        return v
      }

      async function create () {
        await theConnection.promises.query(dropTableSql)
        await theConnection.promises.query(createTableSql)
        const table = await theConnection.promises.getTable(tableName)
        return table
      }

      this.create = create
      this.getVec = getVec
    }
  }

  class BulkTableTest {
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
      await theConnection.promises.query(this.dropTableSql)
      await theConnection.promises.query(this.createTableSql)
      const table = await theConnection.promises.getTable(this.tableName)
      return table
    }
  }

  test('load large number rows', testDone => {
    const bulkTableDef = {
      tableName: 'test_table_bulk',
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 'd1',
          type: 'datetime'
        },
        {
          name: 's1',
          type: 'VARCHAR (255) NOT NULL'
        },
        {
          name: 's2',
          type: 'VARCHAR (100) NOT NULL'
        },
        {
          name: 's3',
          type: 'VARCHAR (50) NOT NULL'
        },
        {
          name: 's4',
          type: 'VARCHAR (50) NOT NULL'
        }
      ]
    }
    async function runner () {
      const helper = new BulkTableTest(theConnection, bulkTableDef)
      const testDate = new Date('Mon Apr 26 2021 22:05:38 GMT-0500 (Central Daylight Time)')
      const expected = []
      const rows = 500
      for (let i = 0; i < rows; ++i) {
        expected.push({
          id: i,
          d1: testDate,
          s1: `${i}`,
          s2: `testing${i + 1}2Data`,
          s3: `testing${i + 2}2Data`,
          s4: `testing${i + 3}2Data`
        })
      }
      theConnection.setUseUTC(true)
      const table = await helper.create()
      try {
        await table.promises.insert(expected)
        const res = await table.promises.select(expected)
        res.forEach(a => {
          delete a.d1.nanosecondsDelta
        })
        assert.deepStrictEqual(res, expected)
      } catch (e) {
        assert.ifError(e)
      }
    }
    runner().then(() => {
      testDone()
    })
  })

  function toUTCDate (localDate) {
    return new Date(
      Date.UTC(
        localDate.getUTCFullYear(),
        localDate.getUTCMonth(),
        localDate.getUTCDate(),
        localDate.getUTCHours(),
        0,
        0,
        0))
  }

  function addDays (days) {
    const localDate = new Date()
    const utcDate = toUTCDate(localDate)
    const result = new Date(utcDate)
    result.setDate(result.getDate() + days)
    return result
  }

  function repeat (c, num) {
    return new Array(num + 1).join(c)
  }

  function parseTime (ds) {
    const [hours, minutes, seconds] = ds.split(':') // Using ES6 destructuring
    // var time = "18:19:02".split(':'); // "Old" ES5 version
    const d = new Date()
    d.setHours(+hours) // Set the hours, using implicit type coercion
    d.setMinutes(minutes) // You can pass Number or String. It doesn't really matter
    d.setSeconds(seconds)
    d.setMilliseconds(0)
    return d
  }

  test('use tableMgr bulk insert single non UTC based time with time col', testDone => {
    async function runner () {
      const helper = new TypeTableHelper(theConnection, 'time')
      const testDate = parseTime('16:47:04')
      const expected = helper.getVec(1, () => testDate)
      theConnection.setUseUTC(true)
      const table = await helper.create()
      const promisedInsert = table.promises.insert
      const promisedSelect = table.promises.select
      try {
        await promisedInsert(expected)
        const res = await promisedSelect(expected)
        res.forEach(a => {
          const today = new Date()
          const h = a.col_a.getHours()
          const m = a.col_a.getMinutes()
          const s = a.col_a.getSeconds()
          today.setHours(h)
          today.setMinutes(m)
          today.setSeconds(s)
          today.setMilliseconds(0)
          a.col_a = today
        })
        assert.deepStrictEqual(res, expected)
      } catch (e) {
        assert.ifError(e)
      }
    }
    runner().then(() => {
      testDone()
    })
  })

  /*
  test('use tableMgr bulk insert single date with date col', testDone => {
    async function runner () {
      const helper = new TypeTableHelper(theConnection, 'date')
      const testDate = new Date('Mon Apr 26 2021 00:00:00 GMT-0500 (Central Daylight Time)')
      const expected = helper.getVec(1, () => testDate)
      theConnection.setUseUTC(false)
      const table = await helper.create()
      const promisedInsert = util.promisify(table.insertRows)
      const promisedSelect = util.promisify(table.selectRows)
      try {
        await promisedInsert(expected)
        const res = await promisedSelect(expected)
        res.forEach(a => {
          delete a.col_a.nanosecondsDelta
        })
        assert.deepStrictEqual(res, expected)
      } catch (e) {
        return e
      }
      return null
    }
    runner().then((e) => {
      testDone(e)
    })
  }) */

  test('use tableMgr bulk insert single non UTC based date with datetime col', testDone => {
    async function runner () {
      const helper = new TypeTableHelper(theConnection, 'datetime')
      const testDate = new Date('Mon Apr 26 2021 22:05:38 GMT-0500 (Central Daylight Time)')
      const expected = helper.getVec(1, () => testDate)
      theConnection.setUseUTC(true)
      const table = await helper.create()
      const promisedInsert = table.promises.insert
      const promisedSelect = table.promises.select
      try {
        await promisedInsert(expected)
        const res = await promisedSelect(expected)
        res.forEach(a => {
          delete a.col_a.nanosecondsDelta
        })
        assert.deepStrictEqual(res, expected)
      } catch (e) {
        assert.ifError(e)
      }
    }
    runner().then(() => {
      testDone()
    })
  })

  test('use tableMgr bulk insert single non UTC based date with DATETIMEOFFSET col', testDone => {
    async function runner () {
      const helper = new TypeTableHelper(theConnection, 'DATETIMEOFFSET')
      const testDate = new Date('Mon Apr 26 2021 22:05:38 GMT-0500 (Central Daylight Time)')
      const expected = helper.getVec(1, () => testDate)
      theConnection.setUseUTC(true)
      const table = await helper.create()
      const promisedInsert = table.promises.insert
      const promisedSelect = table.promises.select
      try {
        await promisedInsert(expected)
        const res = await promisedSelect(expected)
        res.forEach(a => {
          delete a.col_a.nanosecondsDelta
        })
        assert.deepStrictEqual(res, expected)
      } catch (e) {
        assert.ifError(e)
      }
    }
    runner().then(() => {
      testDone()
    })
  })

  test('use tableMgr bulk insert varchar vector - exactly 4001 chars', testDone => {
    async function runner () {
      const b = repeat('z', 4000)
      const helper = new TypeTableHelper(theConnection, 'NVARCHAR(MAX)')
      const expected = helper.getVec(10, i => b)
      const table = await helper.create()
      const promisedInsert = table.promises.insert
      const promisedSelect = table.promises.select
      try {
        await promisedInsert(expected)
        const res = await promisedSelect(expected)
        assert.deepStrictEqual(res, expected)
      } catch (e) {
        assert.ifError(e)
      }
    }
    runner().then(() => {
      testDone()
    })
  })

  test('use tableMgr bulk insert varchar vector - exactly 4000 chars', testDone => {
    async function runner () {
      const b = repeat('z', 4000)
      const helper = new TypeTableHelper(theConnection, 'NVARCHAR(MAX)')
      const expected = helper.getVec(10, i => b)
      const table = await helper.create()
      const promisedInsert = table.promises.insert
      const promisedSelect = table.promises.select
      try {
        await promisedInsert(expected)
        const res = await promisedSelect(expected)
        assert.deepStrictEqual(res, expected)
      } catch (e) {
        assert.ifError(e)
      }
    }
    runner().then(() => {
      testDone()
    })
  })

  test('use tableMgr bulk insert varchar vector - exactly 3999 chars', testDone => {
    async function runner () {
      const b = repeat('z', 4000)
      const helper = new TypeTableHelper(theConnection, 'NVARCHAR(MAX)')
      const expected = helper.getVec(10, i => b)
      const table = await helper.create()
      const promisedInsert = table.promises.insert
      const promisedSelect = table.promises.select
      try {
        await promisedInsert(expected)
        const res = await promisedSelect(expected)
        assert.deepStrictEqual(res, expected)
      } catch (e) {
        assert.ifError(e)
      }
    }
    runner().then(() => {
      testDone()
    })
  })

  test('use tableMgr bulk insert varbinary vector - with null', testDone => {
    async function runner () {
      const b = Buffer.from('0102030405060708090a', 'hex')
      const helper = new TypeTableHelper(theConnection, 'varbinary(10)')
      const expected = helper.getVec(10, i => i % 2 === 0 ? null : b)
      const table = await helper.create()
      const promisedInsert = table.promises.insert
      const promisedSelect = table.promises.select
      try {
        await promisedInsert(expected)
        const res = await promisedSelect(expected)
        assert.deepStrictEqual(res, expected)
      } catch (e) {
        assert.ifError(e)
      }
    }
    runner().then(() => {
      testDone()
    })
  })

  test('use tableMgr bulk insert varbinary vector - with empty', testDone => {
    async function runner () {
      const b = Buffer.from('0102030405060708090a', 'hex')
      const emptyBuffer = Buffer.alloc(0)
      const helper = new TypeTableHelper(theConnection, 'varbinary(10)')
      const expected = helper.getVec(10, i => i % 2 === 0 ? emptyBuffer : b)
      const table = await helper.create()
      const promisedInsert = table.promises.insert
      const promisedSelect = table.promises.select
      try {
        await promisedInsert(expected)
        const res = await promisedSelect(expected)
        assert.deepStrictEqual(res, expected)
      } catch (e) {
        assert.ifError(e)
      }
    }
    runner().then(() => {
      testDone()
    })
  })

  test('use tableMgr bulk insert varbinary vector - no nulls', testDone => {
    async function runner () {
      const b = Buffer.from('0102030405060708090a', 'hex')
      const helper = new TypeTableHelper(theConnection, 'varbinary(20)')
      const expected = helper.getVec(10, _ => b)
      const table = await helper.create()
      const promisedInsert = table.promises.insert
      const promisedSelect = table.promises.select
      try {
        await promisedInsert(expected)
        const res = await promisedSelect(expected)
        assert.deepStrictEqual(res, expected)
      } catch (e) {
        assert.ifError(e)
      }
    }
    runner().then(() => {
      testDone()
    })
  })

  test('use tableMgr bulk insert datetime vector - no nulls', testDone => {
    async function runner () {
      const helper = new TypeTableHelper(theConnection, 'datetime')
      const expected = helper.getVec(10, i => addDays(i))
      const table = await helper.create()
      const promisedInsert = table.promises.insert
      const promisedSelect = table.promises.select
      try {
        await promisedInsert(expected)
        const res = await promisedSelect(expected)
        res.forEach(a => {
          delete a.col_a.nanosecondsDelta
        })
        assert.deepStrictEqual(res, expected)
      } catch (e) {
        assert.ifError(e)
      }
    }
    runner().then(() => {
      testDone()
    })
  })

  test('use tableMgr bulk insert datetime vector - with nulls', testDone => {
    async function runner () {
      const helper = new TypeTableHelper(theConnection, 'datetime')
      const expected = helper.getVec(10, i => i % 2 === 0 ? null : addDays(i))
      const table = await helper.create()
      const promisedInsert = table.promises.insert
      const promisedSelect = table.promises.select
      try {
        await promisedInsert(expected)
        const res = await promisedSelect(expected)
        res.forEach(a => {
          if (a.col_a) {
            delete a.col_a.nanosecondsDelta
          }
        })
        assert.deepStrictEqual(res, expected)
      } catch (e) {
        assert.ifError(e)
      }
    }
    runner().then(() => {
      testDone()
    })
  })

  test('use tableMgr bulk insert decimal vector - no nulls', testDone => {
    async function runner () {
      const helper = new TypeTableHelper(theConnection, 'decimal(20,18)')
      const expected = helper.getVec(10, i => 1 / (i + 2.5))
      const table = await helper.create()
      const promisedInsert = table.promises.insert
      const promisedSelect = table.promises.select
      try {
        await promisedInsert(expected)
        const res = await promisedSelect(expected)
        assert.deepStrictEqual(expected, res)
      } catch (e) {
        assert.ifError(e)
      }
    }
    runner().then(() => {
      testDone()
    })
  })

  test('use tableMgr bulk insert decimal vector - with nulls', testDone => {
    async function runner () {
      const helper = new TypeTableHelper(theConnection, 'decimal(20,18)')
      const expected = helper.getVec(10, i => i % 2 === 0 ? null : 1 / (i + 2.5))
      const table = await helper.create()
      const promisedInsert = table.promises.insert
      const promisedSelect = table.promises.select
      try {
        await promisedInsert(expected)
        const res = await promisedSelect(expected)
        assert.deepStrictEqual(expected, res)
      } catch (e) {
        assert.ifError(e)
      }
    }
    runner().then(() => {
      testDone()
    })
  })

  test('use tableMgr bulk insert bit vector - with nulls', testDone => {
    async function runner () {
      const helper = new TypeTableHelper(theConnection, 'bit')
      const expected = helper.getVec(10, i => i % 2 === 0 ? null : i % 2 === 0)
      const table = await helper.create()
      const promisedInsert = table.promises.insert
      const promisedSelect = table.promises.select
      try {
        await promisedInsert(expected)
        const res = await promisedSelect(expected)
        assert.deepStrictEqual(expected, res)
      } catch (e) {
        assert.ifError(e)
      }
    }
    runner().then(() => {
      testDone()
    })
  })

  test('use tableMgr bulk insert bit vector - no nulls', testDone => {
    async function runner () {
      const helper = new TypeTableHelper(theConnection, 'bit')
      const expected = helper.getVec(10, i => i % 2 === 0)
      const table = await helper.create()
      const promisedInsert = table.promises.insert
      const promisedSelect = table.promises.select
      try {
        await promisedInsert(expected)
        const res = await promisedSelect(expected)
        assert.deepStrictEqual(expected, res)
      } catch (e) {
        assert.ifError(e)
      }
    }
    runner().then(() => {
      testDone()
    })
  })

  test('use tableMgr bulk insert int vector - with nulls', testDone => {
    async function runner () {
      const helper = new TypeTableHelper(theConnection, 'int')
      const expected = helper.getVec(10, i => i % 2 === 0 ? null : i * 10)
      const table = await helper.create()
      const promisedInsert = table.promises.insert
      const promisedSelect = table.promises.select
      try {
        await promisedInsert(expected)
        const res = await promisedSelect(expected)
        assert.deepStrictEqual(expected, res)
      } catch (e) {
        assert.ifError(e)
      }
    }
    runner().then(() => {
      testDone()
    })
  })

  test('use tableMgr bulk insert int vector - no nulls', testDone => {
    async function runner () {
      const helper = new TypeTableHelper(theConnection, 'int')
      const expected = helper.getVec(10, i => i * 10)
      const table = await helper.create()
      const promisedInsert = table.promises.insert
      const promisedSelect = table.promises.select
      try {
        await promisedInsert(expected)
        const res = await promisedSelect(expected)
        assert.deepStrictEqual(expected, res)
      } catch (e) {
        assert.ifError(e)
      }
    }
    runner().then(() => {
      testDone()
    })
  })

  test('use tableMgr bulk insert varchar vector - with nulls', testDone => {
    async function runner () {
      const helper = new TypeTableHelper(theConnection, 'varchar(100)')
      const expected = helper.getVec(10, i => i % 2 === 0 ? null : `string ${i}`)
      const table = await helper.create()
      const promisedInsert = table.promises.insert
      const promisedSelect = table.promises.select
      try {
        await promisedInsert(expected)
        const res = await promisedSelect(expected)
        assert.deepStrictEqual(expected, res)
      } catch (e) {
        assert.ifError(e)
      }
    }
    runner().then(() => {
      testDone()
    })
  })

  test('use tableMgr bulk insert var char vector - no nulls', testDone => {
    async function runner () {
      const helper = new TypeTableHelper(theConnection, 'varchar(100)')
      const expected = helper.getVec(10, i => `string ${i}`)
      const table = await helper.create()
      const promisedInsert = table.promises.insert
      const promisedSelect = table.promises.select
      try {
        await promisedInsert(expected)
        const res = await promisedSelect(expected)
        assert.deepStrictEqual(expected, res)
      } catch (e) {
        assert.ifError(e)
      }
    }
    runner().then(() => {
      testDone()
    })
  })

  test('use tableMgr get Table and update 2 columns', testDone => {
    const helper = new TableHelper(theConnection)
    const expected = helper.getVec(10)
    let table
    const fns = [

      async asyncDone => {
        table = await helper.create()
        asyncDone()
      },

      asyncDone => {
        table.insertRows(expected, (e) => {
          assert.ifError(e)
          asyncDone()
        })
      },

      asyncDone => {
        table.selectRows(expected, (e, res) => {
          assert.ifError(e)
          assert.deepStrictEqual(expected, res)
          asyncDone()
        })
      },

      async asyncDone => {
        const meta = table.getMeta()
        const updateColumns = meta.getUpdateColumns()
        assert(Array.isArray(updateColumns))
        assert(updateColumns.length > 0)
        const cols = updateColumns.slice(0, 2)
        table.setUpdateCols(cols)
        const updateSql = meta.getUpdateSignature()
        assert(updateSql.includes('set [col_a] = ?, [col_b] = ?'))
        const deleteSql = meta.getDeleteSignature()
        assert(deleteSql.includes('where ( [id] = ? )'))
        const selectSql = meta.getSelectSignature()
        assert(selectSql.includes('select [id], [col_a], [col_b], [col_c], [col_d], [col_e], [col_f] from'))
        const updated = expected.map(e => {
          return {
            id: e.id,
            col_a: e.col_a * 2,
            col_b: e.col_b * 2,
            col_c: e.col_c,
            col_d: e.col_d,
            col_e: e.col_e,
            col_f: e.col_f
          }
        })
        const promisedUpdate = table.promises.update
        const promisedSelect = table.promises.select
        try {
          await promisedUpdate(updated)
          const res = await promisedSelect(updated)
          assert.deepStrictEqual(updated, res)
          asyncDone()
        } catch (e) {
          assert.ifError(e)
        }
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test('employee table complex json object test api', testDone => {
    const tableName = 'employee'

    const fns = [

      asyncDone => {
        helper.dropCreateTable({
          tableName: tableName,
          theConnection: theConnection
        }, () => {
          asyncDone()
        })
      },

      asyncDone => {
        bindInsert(tableName, () => {
          asyncDone()
        })
      },

      asyncDone => {
        const tm = theConnection.tableMgr()
        tm.bind(tableName, t => {
          const meta = t.getMeta()

          const select = meta.getSelectSignature()
          assert(select.indexOf('select') >= 0)

          const insert = meta.getInsertSignature()
          assert(insert.indexOf('insert') >= 0)

          const del = meta.getDeleteSignature()
          assert(del.indexOf('delete') >= 0)

          const update = meta.getUpdateSignature()
          assert(update.indexOf('update') >= 0)

          const assignable = meta.getAssignableColumns()
          assert(Array.isArray(assignable))
          assert(assignable.length > 0)

          const updateColumns = meta.getUpdateColumns()
          assert(Array.isArray(updateColumns))
          assert(updateColumns.length > 0)

          const primaryColumns = meta.getPrimaryColumns()
          assert(Array.isArray(primaryColumns))
          assert(primaryColumns.length > 0)

          const whereColumns = meta.getWhereColumns()
          assert(Array.isArray(whereColumns))
          assert(whereColumns.length > 0)

          const byName = meta.getColumnsByName()
          assert(byName !== null)

          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test('test tm with large insert vector - should block for few secs', testDone => {
    const tableName = 'LargeInsert'
    const fns = [
      asyncDone => {
        theConnection.queryRaw(`DROP TABLE ${tableName}`, () => {
          asyncDone()
        })
      },

      asyncDone => {
        theConnection.queryRaw(`CREATE TABLE ${tableName} (
          [BusinessEntityID] [int] NOT NULL,
          [NationalIDNumber] [nvarchar](15) NOT NULL,
          [LoginID] [nvarchar](256) NOT NULL,
          [Salary] int NOT NULL
          )`,
        e => {
          assert.ifError(e)
          asyncDone()
        })
      },

      asyncDone => {
        const tm = theConnection.tableMgr()
        tm.bind(tableName, t => {
          const meta = t.getMeta()

          const select = meta.getSelectSignature()
          assert(select.indexOf('select') >= 0)

          const insert = meta.getInsertSignature()
          assert(insert.indexOf('insert') >= 0)

          const del = meta.getDeleteSignature()
          assert(del.indexOf('delete') >= 0)

          const update = meta.getUpdateSignature()
          assert(update.indexOf('update') >= 0)

          const assignable = meta.getAssignableColumns()
          assert(Array.isArray(assignable))
          assert(assignable.length > 0)

          const updateColumns = meta.getUpdateColumns()
          assert(Array.isArray(updateColumns))
          assert(updateColumns.length > 0)

          const byName = meta.getColumnsByName()
          assert(byName !== null)

          const testVec = getInsertVector(10000)
          t.insertRows(testVec, (e, res) => {
            assert.ifError(e)
            asyncDone()
          })
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test(`bulk insert/select int column of huge unsigned batchSize ${test2BatchSize}`, testDone => {
    hugeUnsignedTest(test2BatchSize, true, false, () => {
      testDone()
    })
  })

  test(`bulk insert/select int column of huge unsigned and some 0 values batchSize ${test2BatchSize}`, testDone => {
    hugeUnsignedPlusZeroMixedTest(test2BatchSize, true, false, () => {
      testDone()
    })
  })

  test(`bulk insert/select datetime column batchSize ${test1BatchSize}`, testDone => {
    dateTest(test1BatchSize, true, function () {
      testDone()
    })
  })

  test(`bulk insert/update/select int column of signed batchSize ${test2BatchSize}`, testDone => {
    signedTest(test2BatchSize, true, true, () => {
      testDone()
    })
  })

  function hugeUnsignedTest (batchSize, selectAfterInsert, runUpdateFunction, testDone) {
    const params = {
      columnType: 'Numeric(18,0)',
      buildFunction: i => i <= 2 ? 2829365649 + i * 2 : i * 2,
      updateFunction: runUpdateFunction ? i => i * 3 : null,
      check: selectAfterInsert,
      deleteAfterTest: false,
      batchSize: batchSize
    }

    simpleColumnBulkTest(params, () => {
      testDone()
    })
  }

  function hugeUnsignedPlusZeroMixedTest (batchSize, selectAfterInsert, runUpdateFunction, testDone) {
    const params = {
      columnType: 'Numeric(18,0)',
      buildFunction: i => i % 2 === 0 ? 2829365649 : 0,
      updateFunction: runUpdateFunction ? i => i * 3 : null,
      check: selectAfterInsert,
      deleteAfterTest: false,
      batchSize: batchSize
    }

    simpleColumnBulkTest(params, () => {
      testDone()
    })
  }

  test('bind to db with space', testDone => {
    let conn = null
    let bulkMgr = null
    const tableName = 'bindTest'
    const fns = [

      asyncDone => {
        // const connectionString = 'Driver={SQL Server Native Client 11.0}; Server=(localdb)\\node; Database={scratch 2}; Trusted_Connection=Yes;'
        sql.open(connStr, function (err, c) {
          assert(err === null || err === false)
          conn = c
          asyncDone()
        })
      },

      asyncDone => {
        setupSimpleType(conn, tableName, () => {
          asyncDone()
        })
      },

      asyncDone => {
        tm = conn.tableMgr()
        tm.bind(tableName, bm => {
          bulkMgr = bm
          assert(bulkMgr !== null)
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test('bulk insert condition failure', testDone => {
    const createTableSql = 'CREATE TABLE Persons (Name varchar(255) NOT NULL)'
    const runQuery = query => {
      return new Promise((resolve, reject) => {
        theConnection.query(query, (err, rows) => {
          if (err) reject(err)
          resolve(rows)
        })
      })
    }
    const fns = [
      asyncDone => {
        theConnection.query('DROP TABLE Persons', () => {
          asyncDone()
        })
      },
      asyncDone => {
        theConnection.query(createTableSql, e => {
          assert.ifError(e)
          asyncDone()
        })
      },
      // normal insert, runs fine
      asyncDone => {
        runQuery('INSERT INTO [Persons] ([Name]) OUTPUT INSERTED.* VALUES (N\'John\')').then(() => {
          asyncDone()
        }).catch((e) => {
          assert.ifError(e)
        })
      },
      // Problematic statement:
      // bulk insert with proper element first, does NOT throw an error
      asyncDone => {
        runQuery('INSERT INTO [Persons] ([Name]) OUTPUT INSERTED.* VALUES (N\'John\'), (null)').then(() => {
          assert(false)
          asyncDone()
        }).catch((e) => {
          assert(e.message.includes('Cannot insert the value NULL into column'), 'Bulk insert should throw an error')
          asyncDone()
        })
      },

      // failing insert, throws proper error
      asyncDone => {
        runQuery('INSERT INTO [Persons] ([Name]) OUTPUT INSERTED.* VALUES (null)').then(() => {
          assert(false)
        }).catch((e) => {
          assert(e.message.includes('Cannot insert the value NULL into column'))
          asyncDone()
        })
      },
      // bulk insert, throws proper error
      asyncDone => {
        runQuery('INSERT INTO [Persons] ([Name]) OUTPUT INSERTED.* VALUES (null), (N\'John\')').then(() => {
          assert(false)
        }).catch((e) => {
          assert(e.message.includes('Cannot insert the value NULL into column'))
          asyncDone()
        })
      },
      asyncDone => {
        runQuery('INSERT INTO [Persons] ([Name]) VALUES (N\'John\'), (null)').then(() => {
          assert(false)
        }).catch((e) => {
          assert(e.message.includes('Cannot insert the value NULL into column'))
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test('non null varchar write empty string', testDone => {
    const tableName = 'emptyString'
    let boundTable = null
    const fns = [

      asyncDone => {
        helper.dropCreateTable({
          tableName: tableName,
          theConnection: theConnection,
          columnName: 'test_field',
          type: 'nvarchar(12)'
        }, () => {
          asyncDone()
        })
      },

      asyncDone => {
        const tm = theConnection.tableMgr()
        tm.bind(tableName, t => {
          const meta = t.getMeta()
          boundTable = t
          assert(boundTable !== null)
          const select = meta.getSelectSignature()
          assert(select.indexOf('select') >= 0)

          const insert = meta.getInsertSignature()
          assert(insert.indexOf('insert') >= 0)

          const del = meta.getDeleteSignature()
          assert(del.indexOf('delete') >= 0)

          const update = meta.getUpdateSignature()
          assert(update.indexOf('update') >= 0)

          const assignable = meta.getAssignableColumns()
          assert(Array.isArray(assignable))
          assert(assignable.length > 0)

          const updateColumns = meta.getUpdateColumns()
          assert(Array.isArray(updateColumns))
          assert(updateColumns.length > 0)

          const primaryColumns = meta.getPrimaryColumns()
          assert(Array.isArray(primaryColumns))
          assert(primaryColumns.length > 0)

          const whereColumns = meta.getWhereColumns()
          assert(Array.isArray(whereColumns))
          assert(whereColumns.length > 0)

          const byName = meta.getColumnsByName()
          assert(byName !== null)

          asyncDone()
        })
      },

      asyncDone => {
        const vec = [
          {
            pkid: 1,
            test_field: ''
          },
          {
            pkid: 2,
            test_field: ''
          }
        ]
        boundTable.insertRows(vec, (err, res) => {
          assert(err === null || err === false)
          assert(res.length <= 1)
          asyncDone()
        })
      },

      asyncDone => {
        theConnection.query(`select len(test_field) as len  from [dbo].${tableName}`, (err, res) => {
          assert(err == null)
          assert(Array.isArray(res))
          assert(res.length === 2)
          const expected = [
            {
              len: 0
            },
            {
              len: 0
            }
          ]
          assert.deepStrictEqual(expected, res)
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test(`bulk insert simple multi-column object - default a nullable column ${test2BatchSize}`, testDone => {
    function buildTest (count) {
      const arr = []
      let str = '-'
      for (let i = 0; i < count; ++i) {
        str = str + i
        if (i % 10 === 0) str = '-'
        const inst = {
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

    const tableName = 'bulkTest'
    let bulkMgr
    const vec = buildTest(totalObjectsForInsert)

    const fns = [
      asyncDone => {
        helper.dropCreateTable({
          tableName: tableName
        }, () => {
          asyncDone()
        })
      },

      asyncDone => {
        const tm = theConnection.tableMgr()
        tm.bind(tableName, bm => {
          bulkMgr = bm
          asyncDone()
        })
      },

      asyncDone => {
        bulkMgr.setBatchSize(totalObjectsForInsert)
        bulkMgr.insertRows(vec, (err, res) => {
          assert(err === null || err === false)
          assert(res.length <= 1)
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test('employee tmp table complex json object array bulk operations', testDone => {
    const tableName = '#employee'

    const fns = [

      asyncDone => {
        helper.dropCreateTable({
          tableName: tableName,
          theConnection: theConnection
        }, () => {
          asyncDone()
        })
      },

      asyncDone => {
        bindInsert(tableName, () => {
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test(`bulk insert/select varbinary column batchSize ${test1BatchSize}`, testDone => {
    varbinaryTest(test1BatchSize, true, () => {
      testDone()
    })
  })

  test(`bulk insert/select varbinary column batchSize ${test2BatchSize}`, testDone => {
    varbinaryTest(test2BatchSize, true, () => {
      testDone()
    })
  })

  test(`bulk insert/select null column of datetime batchSize ${test2BatchSize}`, testDone => {
    nullTest(test2BatchSize, false, () => {
      testDone()
    })
  })

  test(`bulk insert/select null column of datetime batchSize ${test1BatchSize}`, testDone => {
    nullTest(test1BatchSize, false, () => {
      testDone()
    })
  })

  test('employee complex json object array bulk operations', testDone => {
    const tableName = 'employee'

    const fns = [

      asyncDone => {
        helper.dropCreateTable({
          tableName: tableName
        }, () => {
          asyncDone()
        })
      },

      asyncDone => {
        bindInsert(tableName, () => {
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  function bindInsert (tableName, done) {
    let bulkMgr
    const parsedJSON = helper.getJSON()
    const keys = helper.extractKey(parsedJSON, 'BusinessEntityID')
    let selected

    const fns = [
      async asyncDone => {
        try {
          bulkMgr = await theConnection.promises.getTable(tableName)
          await bulkMgr.promises.insert(parsedJSON)
          const results = await bulkMgr.promises.select(keys)
          assert(results.length === parsedJSON.length)
          assert.deepStrictEqual(results, parsedJSON, 'results didn\'t match')
          selected = results
          asyncDone()
        } catch (err) {
          asyncDone(err)
        }
      }
    ]

    async.series(fns, function () {
      done(bulkMgr, selected)
    })
  }

  test('employee insert/select with non primary key', testDone => {
    const tableName = 'employee'
    let parsedJSON
    const whereCols = [
      {
        name: 'LoginID'
      }
    ]

    let bulkMgr
    const fns = [

      asyncDone => {
        helper.dropCreateTable({
          tableName: tableName
        }, () => {
          asyncDone()
        })
      },

      asyncDone => {
        bindInsert(tableName, (bm, selected) => {
          bulkMgr = bm
          parsedJSON = selected
          asyncDone()
        })
      },

      asyncDone => {
        const keys = helper.extractKey(parsedJSON, 'LoginID')
        bulkMgr.setWhereCols(whereCols)
        bulkMgr.selectRows(keys, (err, results) => {
          assert(err === null || err === false)
          assert(results.length === parsedJSON.length)
          assert.deepStrictEqual(results, parsedJSON, 'results didn\'t match')
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  test('employee insert - update a single column', testDone => {
    const tableName = 'employee'
    let parsedJSON
    const updateCols = []

    updateCols.push({
      name: 'ModifiedDate'
    })
    const newDate = new Date('2015-01-01T00:00:00.000Z')
    const modifications = []

    let bulkMgr
    const fns = [

      asyncDone => {
        helper.dropCreateTable({
          tableName: tableName
        }, () => {
          asyncDone()
        })
      },

      asyncDone => {
        bindInsert(tableName, (bm, selected) => {
          bulkMgr = bm
          parsedJSON = selected
          asyncDone()
        })
      },

      asyncDone => {
        parsedJSON.forEach(emp => {
          emp.ModifiedDate = newDate
          modifications.push({
            BusinessEntityID: emp.BusinessEntityID,
            ModifiedDate: newDate
          })
        })
        bulkMgr.setUpdateCols(updateCols)
        bulkMgr.updateRows(modifications, () => {
          asyncDone()
        })
      },

      asyncDone => {
        const keys = helper.extractKey(parsedJSON, 'BusinessEntityID')
        bulkMgr.selectRows(keys, (err, results) => {
          assert(err === null || err === false)
          assert(results.length === parsedJSON.length)
          helper.compareEmployee(results, parsedJSON)
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      testDone()
    })
  })

  function bitTestStrictColumn (batchSize, selectAfterInsert, runUpdateFunction, testDone) {
    const params = {
      columnType: 'bit',
      columnName: 'Key',
      buildFunction: i => i % 2 === 0,
      updateFunction: runUpdateFunction ? i => i % 3 === 0 : null,
      check: selectAfterInsert,
      deleteAfterTest: false,
      batchSize: batchSize
    }

    simpleColumnBulkTest(params, () => {
      testDone()
    })
  }

  test('bulk insert/update/select bit strict column ' + test2BatchSize, testDone => {
    bitTestStrictColumn(test2BatchSize, true, true, () => {
      testDone()
    })
  })

  test('bulk insert/select bit strict column batchSize ' + test1BatchSize, function (testDone) {
    bitTestStrictColumn(test1BatchSize, true, false, () => {
      testDone()
    })
  })

  test('bulk insert/select bit strict column ' + test2BatchSize, function (testDone) {
    bitTestStrictColumn(test2BatchSize, true, false, () => {
      testDone()
    })
  })

  function nullTest (batchSize, selectAfterInsert, testDone) {
    const params = {
      columnType: 'datetime',
      buildFunction: () => null,
      updateFunction: null,
      check: selectAfterInsert,
      deleteAfterTest: false,
      batchSize: batchSize
    }

    simpleColumnBulkTest(params, () => {
      testDone()
    })
  }

  function dateTest (batchSize, selectAfterInsert, testDone) {
    const dt = new Date('2002-02-06T00:00:00.000Z')

    const params = {
      columnType: 'datetime',
      buildFunction: () => {
        dt.setTime(dt.getTime() + 86400000)
        const nt = new Date()
        nt.setTime(dt.getTime())
        nt.nanosecondsDelta = 0
        return nt
      },
      updateFunction: null,
      check: selectAfterInsert,
      deleteAfterTest: false,
      batchSize: batchSize
    }

    simpleColumnBulkTest(params, testDone)
  }

  test(`bulk insert/select datetime column batchSize ${test2BatchSize}`, testDone => {
    dateTest(test2BatchSize, true, function () {
      testDone()
    })
  })

  function signedTest (batchSize, selectAfterInsert, runUpdateFunction, testDone) {
    const params = {
      columnType: 'int',
      buildFunction: i => i % 2 === 0 && i > 0 ? -i : i,
      updateFunction: runUpdateFunction ? i => i * 3 : null,
      check: selectAfterInsert,
      deleteAfterTest: false,
      batchSize: batchSize
    }

    simpleColumnBulkTest(params, () => {
      testDone()
    })
  }

  test(`bulk insert/select int column of signed batchSize ${test1BatchSize}`, testDone => {
    signedTest(test1BatchSize, true, false, () => {
      testDone()
    })
  })

  test(`bulk insert/select int column of signed batchSize ${test2BatchSize}`, testDone => {
    signedTest(test2BatchSize, true, false, () => {
      testDone()
    })
  })

  function unsignedTest (batchSize, selectAfterInsert, runUpdateFunction, testDone) {
    const params = {
      columnType: 'int',
      buildFunction: i => i * 2,
      updateFunction: runUpdateFunction ? i => i * 3 : null,
      check: selectAfterInsert,
      deleteAfterTest: false,
      batchSize: batchSize
    }

    simpleColumnBulkTest(params, () => {
      testDone()
    })
  }

  test(`bulk insert/select int column of unsigned batchSize ${test1BatchSize}`, testDone => {
    unsignedTest(test1BatchSize, true, false, () => {
      testDone()
    })
  })

  test(`bulk insert/select int column of unsigned batchSize ${test2BatchSize}`, testDone => {
    unsignedTest(test2BatchSize, true, false, () => {
      testDone()
    })
  })

  test(`bulk insert/select/update int column of unsigned batchSize ${test2BatchSize}`, testDone => {
    unsignedTest(test2BatchSize, true, true, () => {
      testDone()
    })
  })

  function bitTest (batchSize, selectAfterInsert, runUpdateFunction, testDone) {
    const params = {
      columnType: 'bit',
      buildFunction: i => i % 2 === 0,
      updateFunction: runUpdateFunction ? i => i % 3 === 0 : null,
      check: selectAfterInsert,
      deleteAfterTest: false,
      batchSize: batchSize
    }

    simpleColumnBulkTest(params, () => {
      testDone()
    })
  }

  test(`bulk insert/select bit column batchSize ${test1BatchSize}`, testDone => {
    bitTest(test1BatchSize, true, false, () => {
      testDone()
    })
  })

  test(`bulk insert/select bit column ${test2BatchSize}`, testDone => {
    bitTest(test2BatchSize, true, false, () => {
      testDone()
    })
  })

  test(`bulk insert/update/select bit column ${test2BatchSize}`, testDone => {
    bitTest(test2BatchSize, true, true, () => {
      testDone()
    })
  })

  function decimalTest (batchSize, selectAfterInsert, deleteAfterTest, runUpdateFunction, testDone) {
    const params = {
      columnType: 'decimal(18,4)',
      buildFunction: i => (i * 10) + (i * 0.1),
      updateFunction: runUpdateFunction ? i => (i * 1) + (i * 0.2) : null,
      check: selectAfterInsert,
      deleteAfterTest: deleteAfterTest,
      batchSize: batchSize
    }

    simpleColumnBulkTest(params, testDone)
  }

  test(`bulk insert/select decimal column batchSize ${test1BatchSize}`, testDone => {
    decimalTest(test1BatchSize, true, false, false, testDone)
  })

  test(`bulk insert/select decimal column batchSize ${test2BatchSize}`, testDone => {
    decimalTest(test2BatchSize, true, false, false, testDone)
  })

  test(`bulk insert/select/delete decimal column batchSize ${test2BatchSize}`, testDone => {
    decimalTest(test2BatchSize, true, true, false, testDone)
  })

  test(`bulk insert/update/select decimal column batchSize ${test2BatchSize}`, testDone => {
    decimalTest(test2BatchSize, true, false, true, testDone)
  })

  function varcharTest (batchSize, selectAfterInsert, deleteAfterTest, runUpdateFunction, testDone) {
    const arr = []
    let str = ''
    for (let i = 0; i < 10; ++i) {
      str = str + i
      arr.push(str)
    }

    const params = {
      columnType: 'varchar(100)',
      buildFunction: i => {
        const idx = i % 10
        return arr[idx]
      },
      updateFunction: runUpdateFunction
        ? i => {
            const idx = 9 - (i % 10)
            return arr[idx]
          }
        : null,
      check: selectAfterInsert,
      deleteAfterTest: deleteAfterTest,
      batchSize: batchSize
    }

    simpleColumnBulkTest(params, testDone)
  }

  test(`bulk insert/select varchar column batchSize ${test1BatchSize}`, testDone => {
    varcharTest(test1BatchSize, true, false, false, testDone)
  })

  test(`bulk insert/select varchar column batchSize ${test2BatchSize}`, testDone => {
    varcharTest(test2BatchSize, true, false, false, testDone)
  })

  test(`bulk insert/select/delete varchar column batchSize ${test2BatchSize}`, testDone => {
    varcharTest(test2BatchSize, true, true, false, testDone)
  })

  test(`bulk insert/update/select varchar column batchSize ${test2BatchSize}`, testDone => {
    varcharTest(test2BatchSize, true, false, true, testDone)
  })

  test(`bulk insert/update/select/delete varchar column batchSize ${test2BatchSize}`, testDone => {
    varcharTest(test2BatchSize, true, true, true, testDone)
  })

  test(`bulk insert simple multi-column object in batches ${test2BatchSize}`, testDone => {
    function buildTest (count) {
      const arr = []
      let str = '-'
      for (let i = 0; i < count; ++i) {
        str = str + i
        if (i % 10 === 0) str = '-'
        const inst = {
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

    const tableName = 'bulkTest'

    helper.dropCreateTable({
      tableName: tableName
    }, go)

    function go () {
      const tm = theConnection.tableMgr()
      tm.bind(tableName, test)
    }

    function test (bulkMgr) {
      const batch = totalObjectsForInsert
      const vec = buildTest(batch)
      bulkMgr.insertRows(vec, insertDone)

      function insertDone (err, res) {
        assert.ifError(err)
        assert(res.length <= 1)
        const s = 'select count(*) as count from ' + tableName
        theConnection.query(s, (err, results) => {
          const expected = [{
            count: batch
          }]
          assert.ifError(err)
          assert.deepStrictEqual(results, expected, 'results didn\'t match')
          testDone()
        })
      }
    }
  })

  function simpleColumnBulkTest (params, completeFn) {
    const type = params.columnType
    const buildFunction = params.buildFunction
    const updateFunction = params.updateFunction
    const check = params.check
    const batchSize = params.batchSize
    const deleteAfterTest = params.deleteAfterTest
    const tableName = 'bulkColumn'
    const columnName = params.columnName || 'col1'

    function buildTestObjects (batch, functionToRun) {
      const arr = []

      for (let i = 0; i < batch; ++i) {
        const o = {
          pkid: i
        }
        o[columnName] = functionToRun(i)
        arr.push(o)
      }
      return arr
    }

    const batch = totalObjectsForInsert
    let toUpdate
    const toInsert = buildTestObjects(batch, buildFunction)
    if (updateFunction) toUpdate = buildTestObjects(batch, updateFunction)
    let skip = false
    let bulkMgr

    const fns = [

      asyncDone => {
        helper.dropCreateTable({
          tableName: tableName,
          columnName: columnName,
          type: type
        }, () => {
          asyncDone()
        })
      },

      asyncDone => {
        tm = theConnection.tableMgr()
        tm.bind(tableName, bm => {
          bulkMgr = bm
          asyncDone()
        })
      },

      asyncDone => {
        bulkMgr.setBatchSize(batchSize)
        bulkMgr.insertRows(toInsert, err => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        const s = `select count(*) as count from ${tableName}`
        theConnection.query(s, (err, results) => {
          const expected = [{
            count: batch
          }]
          assert.ifError(err)
          assert.deepStrictEqual(results, expected, 'results didn\'t match')
          asyncDone()
        })
      },

      asyncDone => {
        if (!updateFunction) {
          asyncDone()
        } else {
          bulkMgr.updateRows(toUpdate, (err, res) => {
            assert.ifError(err)
            // assert(res.length === 0)
            asyncDone()
          })
        }
      },

      asyncDone => {
        if (skip) {
          asyncDone()
          return
        }
        if (!check) {
          asyncDone()
          return
        }
        const fetch = []
        for (let i = 0; i < toInsert.length; ++i) {
          fetch.push({
            pkid: i
          })
        }
        const expected = updateFunction ? toUpdate : toInsert
        bulkMgr.selectRows(fetch, (err, results) => {
          assert.ifError(err)
          assert.deepStrictEqual(results, expected, 'results didn\'t match')
          asyncDone()
        })
      },

      asyncDone => {
        if (skip) {
          asyncDone()
          return
        }
        if (!deleteAfterTest) {
          skip = true
          asyncDone()
          return
        }
        bulkMgr.deleteRows(toInsert, (err, res) => {
          assert.ifError(err)
          assert(res.length <= 1)
          asyncDone()
        })
      },

      asyncDone => {
        if (skip) {
          asyncDone()
          return
        }
        const s = `select count(*) as count from ${tableName}`
        theConnection.query(s, (err, results) => {
          const expected = [{
            count: 0
          }]
          assert.ifError(err)
          assert.deepStrictEqual(results, expected, 'results didn\'t match')
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      completeFn()
    })
  }

  const arr = []

  function varbinaryTest (batchSize, selectAfterInsert, testDone) {
    const strings = [
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

    for (let i = 0; i < 10; ++i) {
      arr.push(Buffer.from(strings[i]))
    }

    const params = {
      columnType: 'varbinary(10)',
      buildFunction: i => {
        const idx = i % 10
        return arr[idx]
      },
      updateFunction: null,
      check: selectAfterInsert,
      deleteAfterTest: false,
      batchSize: batchSize
    }

    simpleColumnBulkTest(params, testDone)
  }

  function setupSimpleType (conn, tableName, done) {
    const dropTableSql = `IF OBJECT_ID('${tableName}', 'U') IS NOT NULL 
  DROP TABLE ${tableName};`

    const createTableSql = `create TABLE ${tableName}(
\tdescription varchar(max),
\tusername nvarchar(30), 
\tage int, 
\tsalary real
)`

    const fns = [

      asyncDone => {
        conn.query(dropTableSql, err => {
          assert.ifError(err)
          asyncDone()
        })
      },

      asyncDone => {
        conn.query(createTableSql, err => {
          assert.ifError(err)
          asyncDone()
        })
      }
    ]

    async.series(fns, () => {
      done()
    })
  }
})
