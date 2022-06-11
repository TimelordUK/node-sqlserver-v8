'use strict'
/* globals describe it */

const assert = require('assert')
const { TestEnv } = require('./env/test-env')
const env = new TestEnv()
const sql = require('msnodesqlv8')

let tm
const totalObjectsForInsert = 10
const test1BatchSize = 1
const test2BatchSize = 10

describe('bulk', function () {
  this.timeout(100000)

  this.beforeEach(done => {
    env.open().then(() => done())
  })

  this.afterEach(done => {
    env.close().then(() => done())
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

  it('employee tmp table created on 2 connections - check name clash', async function handler () {
    const tableName = '#test_table'

    const dropTableSql = `IF OBJECT_ID('${tableName}', 'U') IS NOT NULL DROP TABLE ${tableName};`

    const createTableSql = `CREATE TABLE ${tableName} (
      id INT PRIMARY KEY,
      col_a int,
      col_b varchar(100), 
      col_c int,
      col_d int,
      col_e varchar(100)
     );`

    function getVec (c) {
      const d = []
      for (let i = 0; i < c; ++i) {
        d.push({
          id: i,
          col_a: i * 5,
          col_b: `str_${i}`,
          col_c: i + 1,
          col_d: i - 1,
          col_e: `str2_${i}`
        })
      }
      return d
    }

    const c1 = await sql.promises.open(env.connectionString)
    const c2 = await sql.promises.open(env.connectionString)
    await c1.promises.query(dropTableSql)
    await c2.promises.query(dropTableSql)

    await c1.promises.query(createTableSql)
    await c2.promises.query(createTableSql)

    const t1 = await c1.promises.getTable(tableName)
    const t2 = await c2.promises.getTable(tableName)

    assert(t1)
    assert(t2)

    const vec = getVec(20)
    const keys = vec.map(o => {
      return {
        id: o.id
      }
    })

    await t1.promises.insert(vec)
    await t2.promises.insert(vec)

    const s1 = await t1.promises.select(keys)
    const s2 = await t2.promises.select(keys)

    assert.deepStrictEqual(vec, s1)
    assert.deepStrictEqual(vec, s2)

    const m1 = t1.getMeta()
    const m2 = t2.getMeta()
    assert(m1.colByName.id.object_id !== m2.colByName.id.object_id)
    await c1.promises.query(`drop table ${tableName}`)
    await c2.promises.query(`drop table ${tableName}`)
    await c1.promises.close()
    await c2.promises.close()
  })

  async function t0 (proxy) {
    const defS1 = 'def1'
    const defN1 = 2
    const bulkTableDef = {
      tableName: 'test_default_val_table_bulk',
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 's1',
          type: `VARCHAR (255) NOT NULL default '${defS1}'`
        },
        {
          name: 'n1',
          type: `int NOT NULL default ${defN1}`
        }
      ]
    }

    const helper = env.bulkTableTest(bulkTableDef, proxy)
    const expected = []
    const rows = 50
    for (let i = 0; i < rows; ++i) {
      expected.push({
        id: i,
        s1: `${i}`,
        n1: i * 2
      })
    }
    env.theConnection.setUseUTC(true)
    const table = await helper.create()
    await table.promises.insert(expected)
    const res = await table.promises.select(expected)
    assert.deepStrictEqual(res, expected)
  }

  it('connection: table with default values', async function handler () {
    await t0(env.theConnection)
  })

  it('pool: table with default values', async function handler () {
    await env.asPool(t0)
  })

  async function t2 (proxy) {
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

    const helper = env.bulkTableTest(bulkTableDef, proxy)
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
    env.theConnection.setUseUTC(true)
    const table = await helper.create()

    await table.promises.insert(expected)
    const res = await table.promises.select(expected)
    res.forEach(a => {
      delete a.d1.nanosecondsDelta
    })
    assert.deepStrictEqual(res, expected)
  }

  it('connection: load large number rows', async function handler () {
    await t2(env.theConnection)
  })

  it('pool: load large number rows', async function handler () {
    await env.asPool(t2)
  })

  async function t3 (proxy) {
    const timeHelper = env.timeHelper
    const helper = env.typeTableHelper('time', proxy)
    const testDate = timeHelper.parseTime('16:47:04')
    const expected = helper.getVec(1, () => testDate)
    proxy.setUseUTC(true)
    const table = await helper.create()
    const promisedInsert = table.promises.insert
    const promisedSelect = table.promises.select

    await promisedInsert(expected)
    const res = await promisedSelect(expected)
    res.forEach(a => {
      a.col_a = timeHelper.getUTCTime(a.col_a)
    })
    expected.forEach(a => {
      a.col_a = timeHelper.getUTCTime(a.col_a)
      return a
    })
    // console.log('res')
    // console.log(JSON.stringify(res, null, 4))
    // console.log('expected')
    // console.log(JSON.stringify(expected, null, 4))
    assert.deepStrictEqual(res, expected)
  }

  it('connection: use tableMgr bulk insert single non UTC based time with time col', async function handler () {
    await t3(env.theConnection)
  })

  it('pool: use tableMgr bulk insert single non UTC based time with time col', async function handler () {
    await env.asPool(t3)
  })

  async function t4 (proxy) {
    const helper = env.typeTableHelper('datetime', proxy)
    const testDate = new Date('Mon Apr 26 2021 22:05:38 GMT-0500 (Central Daylight Time)')
    const expected = helper.getVec(1, () => testDate)
    proxy.setUseUTC(true)
    const table = await helper.create()
    const promisedInsert = table.promises.insert
    const promisedSelect = table.promises.select

    await promisedInsert(expected)
    const res = await promisedSelect(expected)
    res.forEach(a => {
      delete a.col_a.nanosecondsDelta
    })
    assert.deepStrictEqual(res, expected)
  }

  it('connection: use tableMgr bulk insert single non UTC based date with datetime col', async function handler () {
    await t4(env.theConnection)
  })

  it('pool: use tableMgr bulk insert single non UTC based date with datetime col', async function handler () {
    await env.asPool(t4)
  })

  async function t5 (proxy) {
    const helper = env.typeTableHelper('DATETIMEOFFSET', proxy)
    const testDate = new Date('Mon Apr 26 2021 22:05:38 GMT-0500 (Central Daylight Time)')
    const expected = helper.getVec(1, () => testDate)
    proxy.setUseUTC(true)
    const table = await helper.create()
    const promisedInsert = table.promises.insert
    const promisedSelect = table.promises.select

    await promisedInsert(expected)
    const res = await promisedSelect(expected)
    res.forEach(a => {
      delete a.col_a.nanosecondsDelta
    })
    assert.deepStrictEqual(res, expected)
  }

  it('connection: use tableMgr bulk insert single non UTC based date with DATETIMEOFFSET col', async function handler () {
    await t5(env.theConnection)
  })

  it('pool: use tableMgr bulk insert single non UTC based date with DATETIMEOFFSET col', async function handler () {
    await env.asPool(t5)
  })

  async function runVarCharMaxWithChars (n, proxy) {
    const b = env.repeat('z', n)
    const helper = env.typeTableHelper('NVARCHAR(MAX)', proxy)
    const expected = helper.getVec(10, i => b)
    const table = await helper.create()
    const promisedInsert = table.promises.insert
    const promisedSelect = table.promises.select

    await promisedInsert(expected)
    const res = await promisedSelect(expected)
    assert.deepStrictEqual(res, expected)
  }

  it('connection: use tableMgr bulk insert varchar vector - exactly 4001 chars', async function handler () {
    await runVarCharMaxWithChars(4001, env.theConnection)
  })

  it('connection: use tableMgr bulk insert varchar vector - exactly 4000 chars', async function handler () {
    await runVarCharMaxWithChars(4000, env.theConnection)
  })

  it('connection: use tableMgr bulk insert varchar vector - exactly 3999 chars', async function handler () {
    await runVarCharMaxWithChars(3999, env.theConnection)
  })

  async function t6 (proxy) {
    const b = Buffer.from('0102030405060708090a', 'hex')
    const helper = env.typeTableHelper('varbinary(10)', proxy)
    const expected = helper.getVec(10, i => i % 2 === 0 ? null : b)
    const table = await helper.create()
    const promisedInsert = table.promises.insert
    const promisedSelect = table.promises.select

    await promisedInsert(expected)
    const res = await promisedSelect(expected)
    assert.deepStrictEqual(res, expected)
  }

  it('connection: use tableMgr bulk insert varbinary vector - with null', async function handler () {
    await t6(env.theConnection)
  })

  it('pool: use tableMgr bulk insert varbinary vector - with null', async function handler () {
    await env.asPool(t6)
  })

  async function t7 (proxy) {
    const b = Buffer.from('0102030405060708090a', 'hex')
    const emptyBuffer = Buffer.alloc(0)
    const helper = env.typeTableHelper('varbinary(10)', proxy)
    const expected = helper.getVec(10, i => i % 2 === 0 ? emptyBuffer : b)
    const table = await helper.create()
    const promisedInsert = table.promises.insert
    const promisedSelect = table.promises.select

    await promisedInsert(expected)
    const res = await promisedSelect(expected)
    assert.deepStrictEqual(res, expected)
  }

  it('connection: use tableMgr bulk insert varbinary vector - with empty', async function handler () {
    await t7(env.theConnection)
  })

  it('pool: use tableMgr bulk insert varbinary vector - with empty', async function handler () {
    await env.asPool(t7)
  })

  async function t8 (proxy) {
    const b = Buffer.from('0102030405060708090a', 'hex')
    const helper = env.typeTableHelper('varbinary(20)', proxy)
    const expected = helper.getVec(10, _ => b)
    const table = await helper.create()
    const promisedInsert = table.promises.insert
    const promisedSelect = table.promises.select

    await promisedInsert(expected)
    const res = await promisedSelect(expected)
    assert.deepStrictEqual(res, expected)
  }

  it('connection: use tableMgr bulk insert varbinary vector - no nulls', async function handler () {
    await t8(env.theConnection)
  })

  it('pool: use tableMgr bulk insert varbinary vector - no nulls', async function handler () {
    await env.asPool(t8)
  })

  async function t9 (proxy) {
    const timeHelper = env.timeHelper
    const helper = env.typeTableHelper('datetime', proxy)
    const expected = helper.getVec(10, i => timeHelper.addDays(i))
    const table = await helper.create()
    const promisedInsert = table.promises.insert
    const promisedSelect = table.promises.select

    await promisedInsert(expected)
    const res = await promisedSelect(expected)
    res.forEach(a => {
      delete a.col_a.nanosecondsDelta
    })
    assert.deepStrictEqual(res, expected)
  }

  it('connection: use tableMgr bulk insert datetime vector - no nulls', async function handler () {
    await t9(env.theConnection)
  })

  it('pool: use tableMgr bulk insert datetime vector - no nulls', async function handler () {
    await env.asPool(t9)
  })

  async function t10 (proxy) {
    const timeHelper = env.timeHelper
    const helper = env.typeTableHelper('datetime', proxy)
    const expected = helper.getVec(10, i => i % 2 === 0 ? null : timeHelper.addDays(i))
    const table = await helper.create()
    const promisedInsert = table.promises.insert
    const promisedSelect = table.promises.select
    await promisedInsert(expected)
    const res = await promisedSelect(expected)
    res.forEach(a => {
      if (a.col_a) {
        delete a.col_a.nanosecondsDelta
      }
    })
    assert.deepStrictEqual(res, expected)
  }

  it('connection: use tableMgr bulk insert datetime vector - with nulls', async function handler () {
    await t10(env.theConnection)
  })

  it('pool: use tableMgr bulk insert datetime vector - with nulls', async function handler () {
    await env.asPool(t10)
  })

  async function t11 (proxy) {
    const helper = env.typeTableHelper('decimal(20,18)', proxy)
    const expected = helper.getVec(10, i => 1 / (i + 2.5))
    const table = await helper.create()
    const promisedInsert = table.promises.insert
    const promisedSelect = table.promises.select

    await promisedInsert(expected)
    const res = await promisedSelect(expected)
    assert.deepStrictEqual(expected, res)
  }

  it('connection: use tableMgr bulk insert decimal vector - no nulls', async function handler () {
    await t11(env.theConnection)
  })

  it('pool: use tableMgr bulk insert decimal vector - no nulls', async function handler () {
    await env.asPool(t1)
  })

  async function t12 (proxy) {
    const helper = env.typeTableHelper('decimal(20,18)', proxy)
    const expected = helper.getVec(10, i => i % 2 === 0 ? null : 1 / (i + 2.5))
    const table = await helper.create()
    const promisedInsert = table.promises.insert
    const promisedSelect = table.promises.select

    await promisedInsert(expected)
    const res = await promisedSelect(expected)
    assert.deepStrictEqual(expected, res)
  }

  it('connection: use tableMgr bulk insert decimal vector - with nulls', async function handler () {
    await t12(env.theConnection)
  })

  it('pool: use tableMgr bulk insert decimal vector - with nulls', async function handler () {
    await env.asPool(t12)
  })

  async function t13 (proxy) {
    const helper = env.typeTableHelper('bit', proxy)
    const expected = helper.getVec(10, i => i % 2 === 0 ? null : i % 2 === 0)
    const table = await helper.create()
    const promisedInsert = table.promises.insert
    const promisedSelect = table.promises.select

    await promisedInsert(expected)
    const res = await promisedSelect(expected)
    assert.deepStrictEqual(expected, res)
  }

  it('connection: use tableMgr bulk insert bit vector - with nulls', async function handler () {
    await t13(env.theConnection)
  })

  it('pool: use tableMgr bulk insert bit vector - with nulls', async function handler () {
    await env.asPool(t13)
  })

  async function t14 (proxy) {
    const helper = env.typeTableHelper('bit', proxy)
    const expected = helper.getVec(10, i => i % 2 === 0)
    const table = await helper.create()
    const promisedInsert = table.promises.insert
    const promisedSelect = table.promises.select

    await promisedInsert(expected)
    const res = await promisedSelect(expected)
    assert.deepStrictEqual(expected, res)
  }

  it('connection: use tableMgr bulk insert bit vector - no nulls', async function handler () {
    await t14(env.theConnection)
  })

  it('pool: use tableMgr bulk insert bit vector - no nulls', async function handler () {
    await env.asPool(t14)
  })

  async function t15 (proxy) {
    const helper = env.typeTableHelper('int', proxy)
    const expected = helper.getVec(10, i => i % 2 === 0 ? null : i * 10)
    const table = await helper.create()
    const promisedInsert = table.promises.insert
    const promisedSelect = table.promises.select
    await promisedInsert(expected)
    const res = await promisedSelect(expected)
    assert.deepStrictEqual(expected, res)
  }

  it('connection: use tableMgr bulk insert int vector - with nulls', async function handler () {
    await t15(env.theConnection)
  })

  it('pool: use tableMgr bulk insert int vector - with nulls', async function handler () {
    await env.asPool(t15)
  })

  async function t16 (proxy) {
    const helper = env.typeTableHelper('int', proxy)
    const expected = helper.getVec(10, i => i * 10)
    const table = await helper.create()
    const promisedInsert = table.promises.insert
    const promisedSelect = table.promises.select

    await promisedInsert(expected)
    const res = await promisedSelect(expected)
    assert.deepStrictEqual(expected, res)
  }

  it('connection: use tableMgr bulk insert int vector - no nulls', async function handler () {
    await t16(env.theConnection)
  })

  it('pool: use tableMgr bulk insert int vector - no nulls', async function handler () {
    await env.asPool(t16)
  })

  async function t17 (proxy) {
    const helper = env.typeTableHelper('varchar(100)', proxy)
    const expected = helper.getVec(10, i => i % 2 === 0 ? null : `string ${i}`)
    const table = await helper.create()
    const promisedInsert = table.promises.insert
    const promisedSelect = table.promises.select

    await promisedInsert(expected)
    const res = await promisedSelect(expected)
    assert.deepStrictEqual(expected, res)
  }

  it('connection: use tableMgr bulk insert varchar vector - with nulls', async function handler () {
    await t17(env.theConnection)
  })

  it('pool: use tableMgr bulk insert varchar vector - with nulls', async function handler () {
    await env.asPool(t17)
  })

  async function t18 (proxy) {
    const helper = env.typeTableHelper('varchar(100)', proxy)
    const expected = helper.getVec(10, i => `string ${i}`)
    const table = await helper.create()
    const promisedInsert = table.promises.insert
    const promisedSelect = table.promises.select
    await promisedInsert(expected)
    const res = await promisedSelect(expected)
    assert.deepStrictEqual(expected, res)
  }

  it('connection: use tableMgr bulk insert var char vector - no nulls', async function handler () {
    await t18(env.theConnection)
  })

  it('pool: use tableMgr bulk insert var char vector - no nulls', async function handler () {
    await env.asPool(t18)
  })

  async function t1 (proxy) {
    const helper = env.tableHelper(proxy)
    const expected = helper.getVec(10)
    const table = await helper.create()
    await table.promises.insert(expected)
    const res = await table.promises.select(expected)
    assert.deepStrictEqual(expected, res)

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

    await promisedUpdate(updated)
    const res2 = await promisedSelect(updated)
    assert.deepStrictEqual(updated, res2)
  }

  it('connection: use tableMgr get Table and update 2 columns', async function handler () {
    await t1(env.theConnection)
  })

  it('pool: use tableMgr get Table and update 2 columns', async function handler () {
    await env.asPool(t1)
  })

  function checkMeta (meta) {
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
  }

  async function t19 (proxy) {
    const tableName = 'employee'
    await env.promisedDropCreateTable({
      tableName,
      theConnection: proxy
    })
    await bindInsert(tableName)
    const t = await proxy.promises.getTable(tableName)
    const meta = t.getMeta()
    checkMeta(meta)
  }

  it('connection: employee table complex json object test api', async function handler () {
    await t19(env.theConnection)
  })

  it('proxy: employee table complex json object test api', async function handler () {
    await env.asPool(t19)
  })

  async function t20 (proxy) {
    const tableName = 'LargeInsert'
    const rows = 5000
    await proxy.promises.query(`DROP TABLE ${tableName}`)
    await proxy.promises.query(`CREATE TABLE ${tableName} (
          [BusinessEntityID] [int] NOT NULL,
          [NationalIDNumber] [nvarchar](15) NOT NULL,
          [LoginID] [nvarchar](256) NOT NULL,
          [Salary] int NOT NULL
          PRIMARY KEY (BusinessEntityID)
          )`)
    const t = await proxy.promises.getTable(tableName)
    const meta = t.getMeta()
    checkMeta(meta)
    const testVec = getInsertVector(rows)
    await t.promises.insert(testVec)
    const res = await proxy.promises.query(`select count(*) as cnt from ${tableName}`)
    assert.deepStrictEqual(rows, res.first[0].cnt)
  }

  it('connection: test tm with large insert vector - should block for few secs', async function handler () {
    await t20(env.theConnection)
  })

  it('pool: test tm with large insert vector - should block for few secs', async function handler () {
    await env.asPool(t20)
  })

  it(`bulk insert/select int column of huge unsigned batchSize ${test2BatchSize}`, testDone => {
    hugeUnsignedTest(test2BatchSize, true, false, () => {
      testDone()
    })
  })

  it(`bulk insert/select int column of huge unsigned and some 0 values batchSize ${test2BatchSize}`, testDone => {
    hugeUnsignedPlusZeroMixedTest(test2BatchSize, true, false, () => {
      testDone()
    })
  })

  it(`bulk insert/select datetime column batchSize ${test1BatchSize}`, testDone => {
    dateTest(test1BatchSize, true, function () {
      testDone()
    })
  })

  it(`bulk insert/update/select int column of signed batchSize ${test2BatchSize}`, testDone => {
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
      batchSize
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
      batchSize
    }

    simpleColumnBulkTest(params, () => {
      testDone()
    })
  }

  it('bind to db with space', testDone => {
    let conn = null
    let bulkMgr = null
    const tableName = 'bindTest'
    const fns = [

      asyncDone => {
        // const connectionString = 'Driver={SQL Server Native Client 11.0}; Server=(localdb)\\node; Database={scratch 2}; Trusted_Connection=Yes;'
        sql.open(env.connectionString, function (err, c) {
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

    env.async.series(fns, () => {
      testDone()
    })
  })

  it('bulk insert condition failure', testDone => {
    const createTableSql = 'CREATE TABLE Persons (Name varchar(255) NOT NULL)'
    const runQuery = query => {
      return new Promise((resolve, reject) => {
        env.theConnection.query(query, (err, rows) => {
          if (err) reject(err)
          resolve(rows)
        })
      })
    }
    const fns = [
      asyncDone => {
        env.theConnection.query('DROP TABLE Persons', () => {
          asyncDone()
        })
      },
      asyncDone => {
        env.theConnection.query(createTableSql, e => {
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

    env.async.series(fns, () => {
      testDone()
    })
  })

  it('non null varchar write empty string', testDone => {
    const tableName = 'emptyString'
    let boundTable = null
    const fns = [

      asyncDone => {
        env.helper.dropCreateTable({
          tableName,
          theConnection: env.theConnection,
          columnName: 'test_field',
          type: 'nvarchar(12)'
        }, () => {
          asyncDone()
        })
      },

      asyncDone => {
        const tm = env.theConnection.tableMgr()
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
        env.theConnection.query(`select len(test_field) as len  from [dbo].${tableName}`, (err, res) => {
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

    env.async.series(fns, () => {
      testDone()
    })
  })

  it(`bulk insert simple multi-column object - default a nullable column ${test2BatchSize}`, testDone => {
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
        env.helper.dropCreateTable({
          tableName
        }, () => {
          asyncDone()
        })
      },

      asyncDone => {
        const tm = env.theConnection.tableMgr()
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

    env.async.series(fns, () => {
      testDone()
    })
  })

  /*
 it('employee global tmp table complex json object array bulk operations', testDone => {
    const tableName = '##Employee'

    const fns = [

      asyncDone => {
        env.theConnection.query('drop constraint \'PK_Employee_BusinessEntityID\'', () => {
          asyncDone()
        })
      },

      asyncDone => {
        env.theConnection.query('drop table Employee', () => {
          asyncDone()
        })
      },

      asyncDone => {
        env.theConnection.query(`drop table ${tableName}`, () => {
          asyncDone()
        })

        // PK_Employee_BusinessEntityID
      },

      asyncDone => {
        helper.dropCreateTable({
          tableName: tableName,
          env.theConnection: env.theConnection
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
        env.theConnection.query(`drop table ${tableName}`, () => {
          asyncDone()
        })
      }
    ]

    env.async.series(fns, () => {
      testDone()
    })
  })
*/

  it('employee tmp table complex json object array bulk operations', testDone => {
    const tableName = '#employee'

    const fns = [

      asyncDone => {
        env.helper.dropCreateTable({
          tableName,
          theConnection: env.theConnection
        }, () => {
          asyncDone()
        })
      },

      async asyncDone => {
        await bindInsert(tableName)
        asyncDone()
      }
    ]

    env.async.series(fns, () => {
      testDone()
    })
  })

  it(`bulk insert/select varbinary column batchSize ${test1BatchSize}`, testDone => {
    varbinaryTest(test1BatchSize, true, () => {
      testDone()
    })
  })

  it(`bulk insert/select varbinary column batchSize ${test2BatchSize}`, testDone => {
    varbinaryTest(test2BatchSize, true, () => {
      testDone()
    })
  })

  it(`bulk insert/select null column of datetime batchSize ${test2BatchSize}`, testDone => {
    nullTest(test2BatchSize, false, () => {
      testDone()
    })
  })

  it(`bulk insert/select null column of datetime batchSize ${test1BatchSize}`, testDone => {
    nullTest(test1BatchSize, false, () => {
      testDone()
    })
  })

  it('employee complex json object array bulk operations', testDone => {
    const tableName = 'employee'

    const fns = [

      asyncDone => {
        env.helper.dropCreateTable({
          tableName
        }, () => {
          asyncDone()
        })
      },

      async asyncDone => {
        await bindInsert(tableName)
        asyncDone()
      }
    ]

    env.async.series(fns, () => {
      testDone()
    })
  })

  async function bindInsert (tableName) {
    const parsedJSON = env.helper.getJSON()
    const keys = env.helper.extractKey(parsedJSON, 'BusinessEntityID')
    const bulkMgr = await env.theConnection.promises.getTable(tableName)
    await bulkMgr.promises.insert(parsedJSON)
    const results = await bulkMgr.promises.select(keys)
    assert(results.length === parsedJSON.length)
    assert.deepStrictEqual(results, parsedJSON, 'results didn\'t match')
    return {
      bulkMgr,
      parsedJSON
    }
  }

  it('employee insert/select with non primary key', testDone => {
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
        env.helper.dropCreateTable({
          tableName
        }, () => {
          asyncDone()
        })
      },

      async asyncDone => {
        const r = await bindInsert(tableName)
        bulkMgr = r.bulkMgr
        parsedJSON = r.parsedJSON
        asyncDone()
      },

      asyncDone => {
        const keys = env.helper.extractKey(parsedJSON, 'LoginID')
        bulkMgr.setWhereCols(whereCols)
        bulkMgr.selectRows(keys, (err, results) => {
          assert(err === null || err === false)
          assert(results.length === parsedJSON.length)
          assert.deepStrictEqual(results, parsedJSON, 'results didn\'t match')
          asyncDone()
        })
      }
    ]

    env.async.series(fns, () => {
      testDone()
    })
  })

  it('employee insert - update a single column', testDone => {
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
        env.helper.dropCreateTable({
          tableName
        }, () => {
          asyncDone()
        })
      },

      async asyncDone => {
        const r = await bindInsert(tableName)
        bulkMgr = r.bulkMgr
        parsedJSON = r.parsedJSON
        asyncDone()
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
        const keys = env.helper.extractKey(parsedJSON, 'BusinessEntityID')
        bulkMgr.selectRows(keys, (err, results) => {
          assert(err === null || err === false)
          assert(results.length === parsedJSON.length)
          env.helper.compareEmployee(results, parsedJSON)
          asyncDone()
        })
      }
    ]

    env.async.series(fns, () => {
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
      batchSize
    }

    simpleColumnBulkTest(params, () => {
      testDone()
    })
  }

  it('bulk insert/update/select bit strict column ' + test2BatchSize, testDone => {
    bitTestStrictColumn(test2BatchSize, true, true, () => {
      testDone()
    })
  })

  it('bulk insert/select bit strict column batchSize ' + test1BatchSize, function (testDone) {
    bitTestStrictColumn(test1BatchSize, true, false, () => {
      testDone()
    })
  })

  it('bulk insert/select bit strict column ' + test2BatchSize, function (testDone) {
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
      batchSize
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
      batchSize
    }

    simpleColumnBulkTest(params, testDone)
  }

  it(`bulk insert/select datetime column batchSize ${test2BatchSize}`, testDone => {
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
      batchSize
    }

    simpleColumnBulkTest(params, () => {
      testDone()
    })
  }

  function bigIntTest (batchSize, selectAfterInsert, runUpdateFunction, testDone) {
    const params = {
      columnType: 'bigint',
      buildFunction: i => i % 2 === 0 && i > 0 ? -i : i,
      updateFunction: runUpdateFunction ? i => i * 3 : null,
      check: selectAfterInsert,
      deleteAfterTest: false,
      batchSize
    }

    simpleColumnBulkTest(params, () => {
      testDone()
    })
  }

  function smallIntTest (batchSize, selectAfterInsert, runUpdateFunction, testDone) {
    const params = {
      columnType: 'smallint',
      buildFunction: i => i % 2 === 0 && i > 0 ? -i : i,
      updateFunction: runUpdateFunction ? i => i * 3 : null,
      check: selectAfterInsert,
      deleteAfterTest: false,
      batchSize
    }
    simpleColumnBulkTest(params, () => {
      testDone()
    })
  }

  function tinyIntTest (batchSize, selectAfterInsert, runUpdateFunction, testDone) {
    const params = {
      columnType: 'tinyint',
      buildFunction: i => i % 50,
      updateFunction: runUpdateFunction ? i => i - 1 : null,
      check: selectAfterInsert,
      deleteAfterTest: false,
      batchSize
    }
    simpleColumnBulkTest(params, () => {
      testDone()
    })
  }

  it(`bulk insert/select tinyint column of signed batchSize ${test1BatchSize}`, testDone => {
    tinyIntTest(test1BatchSize, true, false, () => {
      testDone()
    })
  })

  it(`bulk insert/select smallint column of signed batchSize ${test1BatchSize}`, testDone => {
    smallIntTest(test1BatchSize, true, false, () => {
      testDone()
    })
  })

  it(`bulk insert/select bigint column of signed batchSize ${test1BatchSize}`, testDone => {
    bigIntTest(test1BatchSize, true, false, () => {
      testDone()
    })
  })

  it(`bulk insert/select int column of signed batchSize ${test1BatchSize}`, testDone => {
    signedTest(test1BatchSize, true, false, () => {
      testDone()
    })
  })

  it(`bulk insert/select int column of signed batchSize ${test2BatchSize}`, testDone => {
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
      batchSize
    }

    simpleColumnBulkTest(params, () => {
      testDone()
    })
  }

  it(`bulk insert/select int column of unsigned batchSize ${test1BatchSize}`, testDone => {
    unsignedTest(test1BatchSize, true, false, () => {
      testDone()
    })
  })

  it(`bulk insert/select int column of unsigned batchSize ${test2BatchSize}`, testDone => {
    unsignedTest(test2BatchSize, true, false, () => {
      testDone()
    })
  })

  it(`bulk insert/select/update int column of unsigned batchSize ${test2BatchSize}`, testDone => {
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
      batchSize
    }

    simpleColumnBulkTest(params, () => {
      testDone()
    })
  }

  it(`bulk insert/select bit column batchSize ${test1BatchSize}`, testDone => {
    bitTest(test1BatchSize, true, false, () => {
      testDone()
    })
  })

  it(`bulk insert/select bit column ${test2BatchSize}`, testDone => {
    bitTest(test2BatchSize, true, false, () => {
      testDone()
    })
  })

  it(`bulk insert/update/select bit column ${test2BatchSize}`, testDone => {
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
      deleteAfterTest,
      batchSize
    }

    simpleColumnBulkTest(params, testDone)
  }

  it(`bulk insert/select decimal column batchSize ${test1BatchSize}`, testDone => {
    decimalTest(test1BatchSize, true, false, false, testDone)
  })

  it(`bulk insert/select decimal column batchSize ${test2BatchSize}`, testDone => {
    decimalTest(test2BatchSize, true, false, false, testDone)
  })

  it(`bulk insert/select/delete decimal column batchSize ${test2BatchSize}`, testDone => {
    decimalTest(test2BatchSize, true, true, false, testDone)
  })

  it(`bulk insert/update/select decimal column batchSize ${test2BatchSize}`, testDone => {
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
      deleteAfterTest,
      batchSize
    }

    simpleColumnBulkTest(params, testDone)
  }

  it(`bulk insert/select varchar column batchSize ${test1BatchSize}`, testDone => {
    varcharTest(test1BatchSize, true, false, false, testDone)
  })

  it(`bulk insert/select varchar column batchSize ${test2BatchSize}`, testDone => {
    varcharTest(test2BatchSize, true, false, false, testDone)
  })

  it(`bulk insert/select/delete varchar column batchSize ${test2BatchSize}`, testDone => {
    varcharTest(test2BatchSize, true, true, false, testDone)
  })

  it(`bulk insert/update/select varchar column batchSize ${test2BatchSize}`, testDone => {
    varcharTest(test2BatchSize, true, false, true, testDone)
  })

  it(`bulk insert/update/select/delete varchar column batchSize ${test2BatchSize}`, testDone => {
    varcharTest(test2BatchSize, true, true, true, testDone)
  })

  it(`bulk insert simple multi-column object in batches ${test2BatchSize}`, testDone => {
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

    env.helper.dropCreateTable({
      tableName
    }, go)

    function go () {
      const tm = env.theConnection.tableMgr()
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
        env.theConnection.query(s, (err, results) => {
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
        env.helper.dropCreateTable({
          tableName,
          columnName,
          type
        }, () => {
          asyncDone()
        })
      },

      asyncDone => {
        tm = env.theConnection.tableMgr()
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
        env.theConnection.query(s, (err, results) => {
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
        env.theConnection.query(s, (err, results) => {
          const expected = [{
            count: 0
          }]
          assert.ifError(err)
          assert.deepStrictEqual(results, expected, 'results didn\'t match')
          asyncDone()
        })
      }
    ]

    env.async.series(fns, () => {
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
      batchSize
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

    env.async.series(fns, () => {
      done()
    })
  }
})
