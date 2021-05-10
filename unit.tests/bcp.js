'use strict'
/* global suite teardown teardown test setup */

const supp = require('msnodesqlv8/samples/typescript/demo-support')
const assert = require('assert')
const util = require('util')

suite('bcp', function () {
  let theConnection
  this.timeout(100000)
  let connStr
  let helper

  const sql = global.native_sql

  setup(testDone => {
    supp.GlobalConn.init(sql, co => {
      connStr = global.conn_str || co.conn_str
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
      const promisedQuery = util.promisify(theConnection.query)
      const tm = theConnection.tableMgr()
      const promisedGetTable = util.promisify(tm.getTable)
      await promisedQuery(this.dropTableSql)
      await promisedQuery(this.createTableSql)
      const table = await promisedGetTable(this.tableName)
      return table
    }
  }

  test('bcp timestamp timestamp - mix with nulls', testDone => {
    const bulkTableDef = {
      tableName: 'test_table_bcp',
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
          name: 'd2',
          type: 'datetime'
        }]
    }
    async function runner () {
      const testDate = new Date('Mon Apr 26 2021 22:05:38 GMT-0500 (Central Daylight Time)')
      const helper = new BulkTableTest(theConnection, bulkTableDef)
      const expected = []
      const rows = 4000
      for (let i = 0; i < rows; ++i) {
        expected.push({
          id: i,
          d1: i % 2 === 0 ? null : new Date(testDate.getTime() + i * 60 * 60 * 1000),
          d2: i % 3 === 0 ? null : new Date(testDate.getTime() - i * 60 * 60 * 1000)
        })
      }
      theConnection.setUseUTC(false)
      const table = await helper.create()
      table.setUseBcp(true)
      const promisedInsert = util.promisify(table.insertRows)
      const promisedQuery = util.promisify(theConnection.query)
      try {
        const start = new Date()
        await promisedInsert(expected)
        console.log(`inserted ${rows} in ${new Date() - start} ms elapsed`)
        const res = await promisedQuery(`select count(*) as rows from ${bulkTableDef.tableName}`)
        assert.deepStrictEqual(res[0].rows, rows)
      } catch (e) {
        return e
      }
    }
    runner().then((e) => {
      testDone(e)
    })
  })

  test('bcp timestamp timestamp - no null', testDone => {
    const bulkTableDef = {
      tableName: 'test_table_bcp',
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
          name: 'd2',
          type: 'datetime'
        }]
    }
    async function runner () {
      const testDate = new Date('Mon Apr 26 2021 22:05:38 GMT-0500 (Central Daylight Time)')
      const helper = new BulkTableTest(theConnection, bulkTableDef)
      const expected = []
      const rows = 4000
      for (let i = 0; i < rows; ++i) {
        expected.push({
          id: i,
          d1: new Date(testDate.getTime() + i * 60 * 60 * 1000),
          d2: new Date(testDate.getTime() - i * 60 * 60 * 1000)
        })
      }
      theConnection.setUseUTC(false)
      const table = await helper.create()
      table.setUseBcp(true)
      const promisedInsert = util.promisify(table.insertRows)
      const promisedQuery = util.promisify(theConnection.query)
      try {
        const start = new Date()
        await promisedInsert(expected)
        console.log(`inserted ${rows} in ${new Date() - start} ms elapsed`)
        const res = await promisedQuery(`select count(*) as rows from ${bulkTableDef.tableName}`)
        assert.deepStrictEqual(res[0].rows, rows)
      } catch (e) {
        return e
      }
    }
    runner().then((e) => {
      testDone(e)
    })
  })

  test('bcp varchar varchar', testDone => {
    const bulkTableDef = {
      tableName: 'test_table_bcp',
      columns: [
        {
          name: 'id',
          type: 'INT PRIMARY KEY'
        },
        {
          name: 's1',
          type: 'VARCHAR (255) NOT NULL'
        },
        {
          name: 's2',
          type: 'VARCHAR (100) NOT NULL'
        }]
    }
    async function runner () {
      const helper = new BulkTableTest(theConnection, bulkTableDef)
      const expected = []
      const rows = 4000
      for (let i = 0; i < rows; ++i) {
        expected.push({
          id: i,
          s1: `column1${i}`,
          s2: `testing${i + 1}2Data`
        })
      }
      theConnection.setUseUTC(false)
      const table = await helper.create()
      table.setUseBcp(true)
      const promisedInsert = util.promisify(table.insertRows)
      const promisedQuery = util.promisify(theConnection.query)
      try {
        const start = new Date()
        await promisedInsert(expected)
        console.log(`inserted ${rows} in ${new Date() - start} ms elapsed`)
        const res = await promisedQuery(`select count(*) as rows from ${bulkTableDef.tableName}`)
        assert.deepStrictEqual(res[0].rows, rows)
      } catch (e) {
        return e
      }
    }
    runner().then((e) => {
      testDone(e)
    })
  })

  test('bcp int, int column - with nulls', testDone => {
    async function runner () {
      const bulkTableDef = {
        tableName: 'test_table_bcp',
        columns: [
          {
            name: 'id',
            type: 'INT PRIMARY KEY'
          },
          {
            name: 'val',
            type: 'INT'
          }
        ]
      }
      const helper = new BulkTableTest(theConnection, bulkTableDef)
      const expected = []
      const rows = 50000
      for (let i = 0; i < rows; ++i) {
        expected.push({
          id: i,
          val: i % 2 === 0 ? null : i * 2
        })
      }
      theConnection.setUseUTC(false)
      const table = await helper.create()
      table.setUseBcp(true)
      const promisedInsert = util.promisify(table.insertRows)
      const promisedQuery = util.promisify(theConnection.query)
      try {
        const start = new Date()
        await promisedInsert(expected)
        console.log(`inserted ${rows} in ${new Date() - start} ms elapsed`)
        const res = await promisedQuery(`select count(*) as rows from ${bulkTableDef.tableName}`)
        assert.deepStrictEqual(res[0].rows, rows)
      } catch (e) {
        return e
      }
    }
    runner().then((e) => {
      testDone(e)
    })
  })

  test('bcp int, int column', testDone => {
    async function runner () {
      const bulkTableDef = {
        tableName: 'test_table_bcp',
        columns: [
          {
            name: 'id',
            type: 'INT PRIMARY KEY'
          },
          {
            name: 'val',
            type: 'INT'
          }
        ]
      }
      const helper = new BulkTableTest(theConnection, bulkTableDef)
      const expected = []
      const rows = 50000
      for (let i = 0; i < rows; ++i) {
        expected.push({
          id: i,
          val: i * 2
        })
      }
      theConnection.setUseUTC(false)
      const table = await helper.create()
      table.setUseBcp(true)
      const promisedInsert = util.promisify(table.insertRows)
      const promisedQuery = util.promisify(theConnection.query)
      try {
        const start = new Date()
        await promisedInsert(expected)
        console.log(`inserted ${rows} in ${new Date() - start} ms elapsed`)
        const res = await promisedQuery(`select count(*) as rows from ${bulkTableDef.tableName}`)
        assert.deepStrictEqual(res[0].rows, rows)
      } catch (e) {
        return e
      }
    }
    runner().then((e) => {
      testDone(e)
    })
  })

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
      const rows = 3000
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
      theConnection.setUseUTC(false)
      const table = await helper.create()
      const promisedInsert = util.promisify(table.insertRows)
      const promisedSelect = util.promisify(table.selectRows)
      try {
        await promisedInsert(expected)
        const res = await promisedSelect(expected)
        res.forEach(a => {
          delete a.d1.nanosecondsDelta
        })
        assert.deepStrictEqual(res, expected)
      } catch (e) {
        return e
      }
    }
    runner().then((e) => {
      testDone(e)
    })
  })
})
