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

  class BcpEntry {
    constructor (definition, factory) {
      this.definition = definition
      this.factory = factory
    }

    async runner (count) {
      const helper = new BulkTableTest(theConnection, this.definition)
      const expected = []
      const rows = count || 5000
      for (let i = 0; i < rows; ++i) {
        expected.push(this.factory(i))
      }
      theConnection.setUseUTC(false)
      const table = await helper.create()
      table.setUseBcp(true)
      const promisedInsert = util.promisify(table.insertRows)
      const promisedQuery = util.promisify(theConnection.query)
      try {
        await promisedInsert(expected)
        const res = await promisedQuery(`select count(*) as rows from ${this.definition.tableName}`)
        assert.deepStrictEqual(res[0].rows, rows)
        const top = await promisedQuery(`select top 100 * from ${this.definition.tableName}`)
        assert.deepStrictEqual(res[0].rows, rows)
        assert.deepStrictEqual(expected.slice(0, 100), top)
      } catch (e) {
        return e
      }
      return null
    }
  }

  test('bcp bit bit - mix with nulls', testDone => {
    async function test () {
      const bcp = new BcpEntry({
        tableName: 'test_table_bcp',
        columns: [
          {
            name: 'id',
            type: 'INT PRIMARY KEY'
          },
          {
            name: 'b1',
            type: 'bit'
          },
          {
            name: 'b2',
            type: 'bit'
          }]
      }, i => {
        return {
          id: i,
          b1: i % 2 === 0 ? null : i % 3 === 0,
          b2: i % 3 === 0 ? null : i % 5 === 0
        }
      })
      return await bcp.runner()
    }
    test().then((e) => {
      testDone(e)
    })
  })

  test('bcp bit bit', testDone => {
    async function test () {
      const bcp = new BcpEntry({
        tableName: 'test_table_bcp',
        columns: [
          {
            name: 'id',
            type: 'INT PRIMARY KEY'
          },
          {
            name: 'b1',
            type: 'bit'
          },
          {
            name: 'b2',
            type: 'bit'
          }]
      }, i => {
        return {
          id: i,
          b1: i % 2 === 0,
          b2: i % 3 === 0
        }
      })
      return await bcp.runner()
    }
    test().then((e) => {
      testDone(e)
    })
  })

  test('bcp timestamp timestamp - mix with nulls', testDone => {
    async function test () {
      const testDate = new Date('Mon Apr 26 2021 22:05:38 GMT-0500 (Central Daylight Time)')
      const bcp = new BcpEntry({
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
      }, i => {
        return {
          id: i,
          d1: i % 2 === 0 ? null : new Date(testDate.getTime() + i * 60 * 60 * 1000),
          d2: i % 3 === 0 ? null : new Date(testDate.getTime() - i * 60 * 60 * 1000)
        }
      })
      return await bcp.runner()
    }
    test().then((e) => {
      testDone(e)
    })
  })

  test('bcp timestamp timestamp - no null', testDone => {
    async function test () {
      const testDate = new Date('Mon Apr 26 2021 22:05:38 GMT-0500 (Central Daylight Time)')
      const bcp = new BcpEntry({
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
      }, i => {
        return {
          id: i,
          d1: new Date(testDate.getTime() + i * 60 * 60 * 1000),
          d2: new Date(testDate.getTime() - i * 60 * 60 * 1000)
        }
      })
      return await bcp.runner()
    }
    test().then((e) => {
      testDone(e)
    })
  })

  test('bcp varchar varchar with nulls', testDone => {
    async function test () {
      const bcp = new BcpEntry({
        tableName: 'test_table_bcp',
        columns: [
          {
            name: 'id',
            type: 'INT PRIMARY KEY'
          },
          {
            name: 's1',
            type: 'VARCHAR (255) NULL'
          },
          {
            name: 's2',
            type: 'VARCHAR (100) NULL'
          }]
      }, i => {
        return {
          id: i,
          s1: i % 2 === 0 ? null : `column1${i}`,
          s2: `testing${i + 1}2Data`
        }
      })
      return await bcp.runner()
    }
    test().then((e) => {
      testDone(e)
    })
  })

  test('bcp varchar varchar', testDone => {
    async function test () {
      const bcp = new BcpEntry({
        tableName: 'test_table_bcp',
        columns: [
          {
            name: 'id',
            type: 'INT PRIMARY KEY'
          },
          {
            name: 's1',
            type: 'VARCHAR (255) NULL'
          },
          {
            name: 's2',
            type: 'VARCHAR (100) NULL'
          }]
      }, i => {
        return {
          id: i,
          s1: i % 2 === 0 ? null : `column1${i}`,
          s2: `testing${i + 1}2Data`
        }
      })
      return await bcp.runner()
    }
    test().then((e) => {
      testDone(e)
    })
  })

  test('bcp int, int column - with nulls', testDone => {
    async function test () {
      const bcp = new BcpEntry({
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
      }, i => {
        return {
          id: i,
          val: i % 2 === 0 ? null : i * 2
        }
      })
      return await bcp.runner()
    }
    test().then((e) => {
      testDone(e)
    })
  })

  test('bcp int, int column', testDone => {
    async function test () {
      const bcp = new BcpEntry({
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
      }, i => {
        return {
          id: i,
          val: i * 2
        }
      })
      return await bcp.runner()
    }
    test().then((e) => {
      testDone(e)
    })
  })
})
